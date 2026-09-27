import type { Candidate, Evidence, Risk } from "../core/types.js";
import { EvidenceStore } from "../evidence/store.js";
import { verificationLevel } from "../flow/risk.js";
import {getSkillContract,type SkillId} from "../skills/registry.js";

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
