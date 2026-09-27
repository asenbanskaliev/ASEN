import type { Candidate, Risk } from "../core/types.js";
import { EvidenceStore } from "../evidence/store.js";
import { verificationLevel } from "../flow/risk.js";

export interface VerificationResult { ok: boolean; reason: string; }

export function verifyCandidate(candidate: Candidate, risk: Risk, evidence: EvidenceStore): VerificationResult {
  const level = verificationLevel(risk);
  if (!evidence.hasPassing(candidate, "test") && level !== "structural") {
    return { ok: false, reason: "Passing test evidence is required" };
  }
  if (level === "independent" && !evidence.hasPassing(candidate, "review")) {
    return { ok: false, reason: "Independent review evidence is required" };
  }
  const failed = evidence.forCandidate(candidate).some((e) => e.status === "fail");
  if (failed) return { ok: false, reason: "Candidate has failing evidence" };
  return { ok: true, reason: "Verification gates satisfied" };
}
