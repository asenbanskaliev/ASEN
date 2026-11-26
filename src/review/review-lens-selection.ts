import {planReviewRisk,type ReviewLens,type ReviewRiskInput} from "./review-risk.js";

/** An assessed recommendation is an untrusted hint, not approval to omit
 * security and reliability review for an explicitly high-severity candidate.
 * Only an explicit user's request for analysis may activate the calls. */
export interface AdaptiveReviewSelection{
 readonly lenses:readonly ReviewLens[];
 readonly requiresIndependentVerification:boolean;
 readonly source:"assessed-risk";
}
export function selectAdaptiveReviewLenses(input:ReviewRiskInput):AdaptiveReviewSelection{
 const plan=planReviewRisk(input);
 const mandatory:ReviewLens[]=plan.severity==="high"?["risk","reliability"]:[];
 const lenses=[...new Set<ReviewLens>([...mandatory,...plan.lenses])];
 return Object.freeze({
  lenses:Object.freeze(lenses),
  requiresIndependentVerification:plan.independentVerifier,
  source:"assessed-risk" as const
 });
}
