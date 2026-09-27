import type { Risk } from "../core/types.js";
import { assessRisk, verificationLevel } from "./risk.js";

export type OddRoute = "direct" | "plan" | "orchestrate" | "incident" | "verify";

export interface OddFacts {
  filesTouched?: number;
  nonTrivialWrites?: number;
  incident?: boolean;
  longSession?: boolean;
  verificationCommand?: boolean;
  destructiveGit?: boolean;
  externalWrite?: boolean;
  securitySensitive?: boolean;
  unknownScope?: boolean;
}

export interface OddDecision {
  route: OddRoute;
  risk: Risk;
  verification: "structural" | "tests" | "independent";
  reasons: string[];
  requiresSingleWriter: boolean;
  requiresIsolatedPiChild: boolean;
}

export function routeOdd(facts: OddFacts): OddDecision {
  const risk=assessRisk(facts);
  const reasons:string[]=[];
  let route:OddRoute="direct";

  if (facts.incident) { route="incident"; reasons.push("incident"); }
  else if (facts.verificationCommand) { route="verify"; reasons.push("verification-command"); }
  else if ((facts.filesTouched ?? 0)>=4) { route="orchestrate"; reasons.push("four-or-more-files"); }
  else if ((facts.nonTrivialWrites ?? 0)>=2) { route="orchestrate"; reasons.push("two-or-more-nontrivial-writes"); }
  else if (facts.longSession) { route="orchestrate"; reasons.push("long-session"); }
  else if (risk==="high" || risk==="unknown") { route="plan"; reasons.push(risk==="unknown"?"unknown-scope":"high-risk"); }

  if (reasons.length===0) reasons.push("simple-bounded-request");
  return {
    route,
    risk,
    verification: verificationLevel(risk),
    reasons,
    requiresSingleWriter: route==="orchestrate" || route==="incident",
    requiresIsolatedPiChild: route==="orchestrate" || route==="incident" || route==="verify"
  };
}
