import type {Candidate} from "../core/types.js";
import type {SkillSelectionContext} from "./registry.js";

export type IssuedSkillContext=Readonly<SkillSelectionContext>&{
 readonly taskId:string;
 readonly repository:string;
 readonly candidateId?:string;
 readonly candidateRevision?:string;
};

const issuedContexts=new WeakSet<object>();

export function issueSkillContext(taskId:string,repository:string,candidate:Candidate|undefined,context:SkillSelectionContext):IssuedSkillContext {
 if(candidate&&candidate.repository!==repository) throw new Error("Skill context candidate repository mismatch");
 const issued=Object.freeze({
  ...context,
  taskId,
  repository,
  ...(candidate?{candidateId:candidate.id,candidateRevision:candidate.revision}:{})
 });
 issuedContexts.add(issued);
 return issued;
}

export function isIssuedSkillContext(value:unknown):value is IssuedSkillContext {
 return typeof value==="object"&&value!==null&&issuedContexts.has(value);
}

export function matchesIssuedSkillContext(context:IssuedSkillContext,taskId:string,repository:string,candidate?:Candidate):boolean {
 if(!isIssuedSkillContext(context)||context.taskId!==taskId||context.repository!==repository) return false;
 if(!candidate) return context.candidateId===undefined&&context.candidateRevision===undefined;
 return context.candidateId===candidate.id&&context.candidateRevision===candidate.revision&&candidate.repository===repository;
}
