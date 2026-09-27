import type { Candidate, Evidence, Risk } from "../core/types.js";
import { EvidenceStore } from "../evidence/store.js";
import { verificationLevel } from "../flow/risk.js";
import {getSkillContract,selectSkills,type SkillId,type SkillSelectionContext} from "../skills/registry.js";
import {isIssuedSkillContext,matchesIssuedSkillContext} from "../skills/context.js";

export interface VerificationResult { ok: boolean; reason: string; }

const skillEvidenceKinds = new Set<Evidence["kind"]>(["tdd","review","route-decision","work-unit","scope","rollback"]);
function evidenceKindFor(requirement:string):Evidence["kind"] {
 if(!skillEvidenceKinds.has(requirement as Evidence["kind"])) throw new Error(`Unknown skill evidence requirement: ${requirement}`);
 return requirement as Evidence["kind"];
}

export function verifySkillEvidence(candidate:Candidate,skills:readonly SkillId[],evidence:EvidenceStore,gate:"mutation"|"verification"|"release"):VerificationResult {
 for(const id of skills){
  const contract=getSkillContract(id);
  if(!contract.blocks.includes(gate)) continue;
  for(const requirement of contract.evidence){
   const kind=evidenceKindFor(requirement);
   if(!evidence.hasPassing(candidate,kind)) return {ok:false,reason:`Skill ${id} requires passing ${requirement} evidence for ${gate}`};
  }
 }
 return {ok:true,reason:"Required skill evidence satisfied"};
}

export function verifyCandidate(candidate: Candidate, risk: Risk, evidence: EvidenceStore, skills:readonly SkillId[]=[]): VerificationResult {
  const level = verificationLevel(risk);
  if (!evidence.hasPassing(candidate, "test") && level !== "structural") {
    return { ok: false, reason: "Passing test evidence is required" };
  }
  if (level === "independent" && !evidence.hasPassing(candidate, "review")) {
    return { ok: false, reason: "Independent review evidence is required" };
  }
  const skillGate=verifySkillEvidence(candidate,skills,evidence,"verification");
  if(!skillGate.ok) return skillGate;
  const failed = evidence.forCandidate(candidate).some((e) => e.status === "fail");
  if (failed) return { ok: false, reason: "Candidate has failing evidence" };
  return { ok: true, reason: "Verification gates satisfied" };
}


export function authorizeRelease(candidate:Candidate,risk:Risk,evidence:EvidenceStore,context:SkillSelectionContext):VerificationResult {
 if(!isIssuedSkillContext(context)) return {ok:false,reason:"Release requires ASEN-issued skill selection context"};
 if(!matchesIssuedSkillContext(context,context.taskId,candidate.repository,candidate)) return {ok:false,reason:"Release skill context does not match candidate"};
 const skills=selectSkills(context).map(skill=>skill.id);
 if(!skills.length) return {ok:false,reason:"Release requires selected skills"};
 const verification=verifyCandidate(candidate,risk,evidence,skills);
 if(!verification.ok) return verification;
 const releaseGate=verifySkillEvidence(candidate,skills,evidence,"release");
 if(!releaseGate.ok) return releaseGate;
 return {ok:true,reason:"Release gates satisfied"};
}


export interface TransitionAuthorization {
 readonly target:"IMPLEMENTING"|"VERIFIED";
 readonly candidateRepository:string;
 readonly candidateId:string;
 readonly candidateRevision:string;
}
const transitionAuthorizations=new WeakSet<object>();

function mintTransitionAuthorization(candidate:Candidate,target:TransitionAuthorization["target"]):TransitionAuthorization {
 const authorization=Object.freeze({
  target,
  candidateRepository:candidate.repository,
  candidateId:candidate.id,
  candidateRevision:candidate.revision
 });
 transitionAuthorizations.add(authorization);
 return authorization;
}

export function isTransitionAuthorization(value:unknown):value is TransitionAuthorization {
 return typeof value==="object"&&value!==null&&transitionAuthorizations.has(value);
}

export function authorizeImplementation(candidate:Candidate,context:SkillSelectionContext,evidence:EvidenceStore):TransitionAuthorization {
 if(!isIssuedSkillContext(context)) throw new Error("Implementation requires ASEN-issued skill selection context");
 if(!matchesIssuedSkillContext(context,context.taskId,candidate.repository,candidate)) throw new Error("Implementation skill context does not match candidate");
 const skills=selectSkills(context).map(skill=>skill.id);
 if(!skills.length) throw new Error("Implementation requires selected skills");
 const gate=verifySkillEvidence(candidate,skills,evidence,"mutation");
 if(!gate.ok) throw new Error(gate.reason);
 return mintTransitionAuthorization(candidate,"IMPLEMENTING");
}

export function authorizeVerified(candidate:Candidate,risk:Risk,context:SkillSelectionContext,evidence:EvidenceStore):TransitionAuthorization {
 if(!isIssuedSkillContext(context)) throw new Error("Verification requires ASEN-issued skill selection context");
 if(!matchesIssuedSkillContext(context,context.taskId,candidate.repository,candidate)) throw new Error("Verification skill context does not match candidate");
 const skills=selectSkills(context).map(skill=>skill.id);
 if(!skills.length) throw new Error("Verification requires selected skills");
 const gate=verifyCandidate(candidate,risk,evidence,skills);
 if(!gate.ok) throw new Error(gate.reason);
 return mintTransitionAuthorization(candidate,"VERIFIED");
}
