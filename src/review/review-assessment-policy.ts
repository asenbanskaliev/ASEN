/** U2: unused-in-production, descriptive planning only; never start/collect/ack or consent.
 * Reference: lib/review-risk-assessment.ts verificationRisk/verificationPlan and
 * assets/orchestrator-verification.md. No model/profile heuristics or native bindings.
 */
export type ObservedRisk = "passive" | "medium" | "high" | "unassessable";
/** Unresolved/unknown observations must be represented as unavailable, never on. */
export type ObservedReviewMode = "on" | "off" | "unavailable";
export interface NamedRiskEscalation {
  /** 1 data/irreversible effects; 2 security; 3 consumed contracts;
   * 4 concurrency; 5 delivery/environment; 6 no regression-catching test. */
  readonly item: 1 | 2 | 3 | 4 | 5 | 6;
  readonly reason: string;
}
export interface ReviewAssessmentPolicyInput {
  readonly nativeRisk: ObservedRisk;
  readonly mode: ObservedReviewMode;
  readonly escalation?: NamedRiskEscalation;
  /** Absent/undefined on older reference binaries; never default to false. */
  readonly reviewDue?: boolean | undefined;
}
export interface ReviewAssessmentPolicyResult extends ReviewAssessmentPolicyInput {
  readonly verificationRisk: "passive" | "medium" | "high";
  readonly writerSelfVerification: boolean;
  readonly structuralReadbackOnly: boolean;
  readonly independentVerifier: boolean;
  /** Informational due metadata only, not a runnable review recommendation. */
  readonly reviewRecommendation: "assessment-only" | "unavailable" | "unknown" | "due" | "not-due";
  readonly lifecycleAuthority: false;
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !keys.includes(key))) {
    throw new TypeError("Expected an object with only the declared policy fields");
  }
  return value as Record<string, unknown>;
}

/** Invalid shapes throw; only explicit unassessable/unavailable encodes missing evidence.
 * Native high/unassessable informs as medium. Escalation alone adds a verifier.
 * Any RDD mode follows the same verification plan; review never replaces it.
 * This standalone plan does not waive parent-authorized tests or existing release guards.
 */
export function assessReviewPolicy(input: ReviewAssessmentPolicyInput): ReviewAssessmentPolicyResult {
  const value = record(input, ["nativeRisk", "mode", "escalation", "reviewDue"]);
  const { nativeRisk, mode, reviewDue } = value;
  if (!["passive", "medium", "high", "unassessable"].includes(nativeRisk as string)) {
    throw new TypeError("nativeRisk must be passive, medium, high or unassessable");
  }
  if (!["on", "off", "unavailable"].includes(mode as string)) {
    throw new TypeError("mode must be on, off or unavailable");
  }
  if (reviewDue !== undefined && typeof reviewDue !== "boolean") {
    throw new TypeError("reviewDue must be boolean when present");
  }
  let escalation: NamedRiskEscalation | undefined;
  if (value.escalation !== undefined) {
    const { item, reason } = record(value.escalation, ["item", "reason"]);
    if (typeof item !== "number" || !Number.isInteger(item) || item < 1 || item > 6
      || typeof reason !== "string" || reason.trim() === "" || reason.length > 500) {
      throw new TypeError("escalation needs item 1..6 and a nonempty reason of at most 500 characters");
    }
    escalation = Object.freeze({ item: item as NamedRiskEscalation["item"], reason });
  }
  const verificationRisk = escalation ? "high" : nativeRisk === "passive" ? "passive" : "medium";
  return Object.freeze({
    nativeRisk: nativeRisk as ObservedRisk,
    mode: mode as ObservedReviewMode,
    ...(escalation === undefined ? {} : { escalation }),
    ...(reviewDue === undefined ? {} : { reviewDue: reviewDue as boolean }),
    verificationRisk,
    writerSelfVerification: verificationRisk !== "passive",
    structuralReadbackOnly: verificationRisk === "passive",
    independentVerifier: verificationRisk === "high",
    reviewRecommendation: mode === "off" ? "assessment-only" : mode === "unavailable" ? "unavailable"
      : reviewDue === undefined ? "unknown" : reviewDue ? "due" : "not-due",
    lifecycleAuthority: false,
  });
}
