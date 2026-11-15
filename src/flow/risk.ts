import type { Risk } from "../core/types.js";

export interface ChangeFacts {
  filesTouched?: number;
  nonTrivialWrites?: number;
  destructiveGit?: boolean;
  externalWrite?: boolean;
  securitySensitive?: boolean;
  unknownScope?: boolean;
}

export function assessRisk(facts: ChangeFacts): Risk {
  if (facts.unknownScope) return "unknown";
  if (facts.destructiveGit || facts.externalWrite || facts.securitySensitive) return "high";
  if ((facts.nonTrivialWrites ?? 0) > 0) return "medium";
  return "low";
}

export function verificationLevel(risk: Risk): "structural" | "tests" | "independent" {
  if (risk === "low") return "structural";
  if (risk === "medium") return "tests";
  return "independent";
}
