import { validateWriteGrant, type WriteGrant } from "../policies/scopes.js";
import type {Candidate} from "../core/types.js";
import {EvidenceStore} from "../evidence/store.js";
import {selectSkills,type SkillSelectionContext} from "../skills/registry.js";
import {isIssuedSkillContext,matchesIssuedSkillContext} from "../skills/context.js";
import {verifySkillEvidence} from "../verify/verifier.js";

export interface AgentRequest { id:string; role:"explorer"|"worker"|"reviewer"|"verifier"; prompt:string; repository:string; writeSurfaces?:string[]; isolationKey?:string; candidate?:Candidate; skillContext?:SkillSelectionContext; skillPaths?:string[]; }
export interface AgentResult { id:string; ok:boolean; output:string; }
export interface AgentRunner { run(request:AgentRequest):Promise<AgentResult>; }

export class Dispatcher {
 readonly #active:WriteGrant[]=[]; #running=0; readonly #waiters:Array<()=>void>=[];
 constructor(private readonly runner:AgentRunner,private readonly evidence:EvidenceStore,private readonly maxConcurrency=4){if(!Number.isInteger(maxConcurrency)||maxConcurrency<1)throw new Error("maxConcurrency must be a positive integer");}
 async #acquire():Promise<void>{if(this.#running<this.maxConcurrency){this.#running++;return;}await new Promise<void>(resolve=>this.#waiters.push(resolve));this.#running++;}
 #release():void{this.#running--;this.#waiters.shift()?.();}
 async dispatch(request:AgentRequest):Promise<AgentResult>{
  await this.#acquire();let grant:WriteGrant|undefined;
  try{
   if(request.skillContext||request.skillPaths){
    if(!request.skillContext||!isIssuedSkillContext(request.skillContext)) throw new Error("Delegated skill paths require ASEN-issued skill selection context");
    const expectedPaths=selectSkills(request.skillContext).map(skill=>skill.path);
    if(!request.skillPaths||request.skillPaths.length!==expectedPaths.length||request.skillPaths.some((path,index)=>path!==expectedPaths[index])) throw new Error("Delegated skill paths do not match issued context");
   }
   if(request.writeSurfaces){
    if(request.role!=="worker") throw new Error("Only worker agents may receive write authority");
    if(!request.candidate) throw new Error("Write authority requires an exact candidate");
    if(request.candidate.repository!==request.repository) throw new Error("Write candidate repository mismatch");
    if(!request.skillContext) throw new Error("Write authority requires skill selection context");
    if(!isIssuedSkillContext(request.skillContext)) throw new Error("Write authority requires ASEN-issued skill selection context");
    const taskId=request.id.endsWith(":worker")?request.id.slice(0,-":worker".length):request.id;
    if(!matchesIssuedSkillContext(request.skillContext,taskId,request.repository,request.candidate)) throw new Error("Write authority skill context does not match task/candidate");
    const selectedSkills=selectSkills(request.skillContext);
    const skills=selectedSkills.map(skill=>skill.id);
    if(!skills.length) throw new Error("Write authority requires mandatory skills");
    const gate=verifySkillEvidence(request.candidate,skills,this.evidence,"mutation");
    if(!gate.ok) throw new Error(`Write authority blocked: ${gate.reason}`);
    grant={agentId:request.id,repository:request.repository,surfaces:request.writeSurfaces};
    if(request.isolationKey)grant.isolationKey=request.isolationKey;
    validateWriteGrant(grant,this.#active);this.#active.push(grant);
   }
   return await this.runner.run(request);
  } finally {if(grant){const i=this.#active.indexOf(grant);if(i>=0)this.#active.splice(i,1);}this.#release();}
 }
}
