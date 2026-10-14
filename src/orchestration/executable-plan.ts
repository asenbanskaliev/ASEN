import type {OrchestrationPlan} from "./orchestrator.js";
import type {Candidate} from "../core/types.js";
import type {IssuedSkillContext} from "../skills/context.js";
import {selectSkills,type SkillSelectionContext} from "../skills/registry.js";

export type PlannedTaskRole="primary"|"explorer"|"worker"|"reviewer"|"verifier"|"clarifier";
export interface PlannedTask {
 readonly id:string;
 readonly role:PlannedTaskRole;
 readonly title:string;
 readonly instruction:string;
 readonly dependsOn:readonly string[];
 readonly priority:number;
 readonly skills:readonly string[];
 readonly skillPaths:readonly string[];
 readonly skillSelection?:SkillSelectionContext;
 readonly candidate?:Candidate;
 readonly writeSurfaces?:readonly string[];
 readonly writerAuthorizationBasis?:string;
 readonly status:"ready"|"waiting"|"clarification_required";
 readonly execution:"not_started";
 readonly authorization:"required_before_dispatch";
}
export interface ExecutablePlan {
 readonly taskId:string;
 readonly repository:string;
 readonly route:OrchestrationPlan["decision"]["route"];
 readonly tasks:readonly PlannedTask[];
 readonly topologicalOrder:readonly string[];
 readonly execution:"not_started";
 readonly authorization:"required_before_dispatch";
}
function selectionOf(context:IssuedSkillContext|undefined):SkillSelectionContext|undefined{
 if(!context?.phase)return undefined;
 return {phase:context.phase,...(context.defect!==undefined?{defect:context.defect}:{}),...(context.codeChange!==undefined?{codeChange:context.codeChange}:{}),...(context.behaviorChange!==undefined?{behaviorChange:context.behaviorChange}:{}),...(context.risk?{risk:context.risk}:{}),...(context.filesTouched!==undefined?{filesTouched:context.filesTouched}:{}),...(context.verification!==undefined?{verification:context.verification}:{})};
}

/** Materializes the existing ODD route and selected roles as an ordered, inspectable task DAG.
 * This is a plan only: it never grants permissions or starts an agent. */
export function materializeExecutablePlan(plan:OrchestrationPlan,instruction:string,writerAuthorizationBasis?:string):ExecutablePlan{
 const decision=plan.decision,taskId=decision.taskIdentity;
 if(!taskId||!decision.repositoryIdentity||typeof instruction!=="string"||!instruction.trim()||instruction!==instruction.trim()||instruction.length>8192||/[\u0000-\u001f\u007f-\u009f]/u.test(instruction))throw new Error("Executable plan identity or instruction is invalid");
 const tasks:PlannedTask[]=[],priority:Readonly<Record<PlannedTaskRole,number>>={clarifier:1,primary:1,explorer:1,worker:2,reviewer:3,verifier:4};
 const add=(role:PlannedTaskRole,title:string,text:string,dependsOn:string[],skills:readonly string[],skillPaths:readonly string[]=[],skillSelection?:SkillSelectionContext,status:PlannedTask["status"]="waiting")=>{
  const id=`${taskId}:${role}`;
  tasks.push(Object.freeze({id,role,title,instruction:text,dependsOn:Object.freeze(dependsOn),priority:priority[role],skills:Object.freeze([...skills]),skillPaths:Object.freeze([...skillPaths]),...(skillSelection?{skillSelection:Object.freeze({...skillSelection})}:{}),status,execution:"not_started",authorization:"required_before_dispatch"}));
  return id;
 };
 if(decision.route==="plan"){
  add("clarifier","Resolve missing or high-risk facts",`Clarify the task before selecting or dispatching capabilities. Original instruction: ${instruction}`,[],plan.skills,[],undefined,"clarification_required");
 }else if(plan.agents.length===0){
  const selection=selectionOf(plan.skillContext);
  add("primary","Carry out the bounded primary-session task",instruction,[],plan.skills,selection?selectSkills(selection).map(skill=>skill.path):[],selection,"ready");
 }else{
  const byRole=new Map(plan.agents.map(agent=>[agent.role,agent]));
  const ids=new Map<string,string>();
  for(const role of ["explorer","worker","reviewer","verifier"] as const){
   const agent=byRole.get(role);if(!agent)continue;
   const dependencies=role==="worker"?[ids.get("explorer")].filter((id):id is string=>!!id):role==="reviewer"?[ids.get("worker")].filter((id):id is string=>!!id):role==="verifier"?[ids.get("worker"),ids.get("reviewer")].filter((id):id is string=>!!id):[];
   const text=role==="explorer"?`Inspect the repository and report relevant evidence for: ${instruction}`:role==="worker"?`Perform only the authorized, scoped work for: ${instruction}`:role==="reviewer"?`Independently review the actual changes against the original acceptance criteria: ${instruction}. Return exactly one JSON object with keys verdict and evidence. verdict must be pass or fail. evidence must be a non-empty array of concise findings. Do not mark pass if a material criterion fails.`:`Independently verify the actual changes and acceptance criteria for: ${instruction}. Run the relevant local checks and inspect the final diff. Return exactly one JSON object with keys verdict and evidence. verdict must be pass or fail. evidence must be a non-empty array of concise findings, including the checks run and their result. Do not mark pass if a material criterion fails.`;
   const selection=selectionOf(agent.skillContext);
   const id=add(role,`${role[0]!.toUpperCase()}${role.slice(1)} task`,text,dependencies,selection?selectSkills(selection).map(skill=>skill.id):[],agent.skillPaths??[],selection,dependencies.length?"waiting":"ready");
   const task=tasks.find(item=>item.id===id)!;
   if(role==="worker"&&agent.writeSurfaces?.length&&agent.candidate&&writerAuthorizationBasis){
    const writable=Object.freeze({...task,candidate:Object.freeze({...agent.candidate}),writeSurfaces:Object.freeze([...agent.writeSurfaces]),writerAuthorizationBasis});
    tasks[tasks.indexOf(task)]=writable;
   }
   ids.set(role,id);
  }
 }
 const byId=new Map(tasks.map(item=>[item.id,item]));
 if(byId.size!==tasks.length||tasks.some(item=>item.dependsOn.some(id=>!byId.has(id)||id===item.id)))throw new Error("Executable plan contains invalid task dependencies");
 const visited=new Set<string>(),visiting=new Set<string>(),order:string[]=[];
 const visit=(id:string)=>{if(visiting.has(id))throw new Error("Executable plan dependency cycle");if(visited.has(id))return;visiting.add(id);for(const dependency of byId.get(id)!.dependsOn)visit(dependency);visiting.delete(id);visited.add(id);order.push(id);};
 for(const item of tasks)visit(item.id);
 return Object.freeze({taskId,repository:decision.repositoryIdentity,route:decision.route,tasks:Object.freeze(tasks),topologicalOrder:Object.freeze(order),execution:"not_started",authorization:"required_before_dispatch"});
}
