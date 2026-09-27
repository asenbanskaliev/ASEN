import type {SkillSelectionContext} from "./registry.js";

export type IssuedSkillContext=Readonly<SkillSelectionContext>;

const issuedContexts=new WeakSet<object>();

export function issueSkillContext(context:SkillSelectionContext):IssuedSkillContext {
 const issued=Object.freeze({...context});
 issuedContexts.add(issued);
 return issued;
}

export function isIssuedSkillContext(value:unknown):value is IssuedSkillContext {
 return typeof value==="object"&&value!==null&&issuedContexts.has(value);
}
