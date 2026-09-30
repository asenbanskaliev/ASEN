import type {Candidate,Evidence} from "../../src/core/types.js";
import {EvidenceStore,type RouteDecisionMetadata} from "../../src/evidence/store.js";
import {buildOrchestrationPlan,type OrchestrationRouteEvidence} from "../../src/orchestration/orchestrator.js";
import {issueOddDecision} from "./odd-routing.js";

/** Builds a genuine candidate-bound plan and returns its one-use route evidence. */
export function genuineRouteEvidence(candidate:Candidate,taskId="route-evidence"):OrchestrationRouteEvidence{
 const decision=issueOddDecision({taskId,repository:candidate.repository});
 const plan=buildOrchestrationPlan({taskId,repository:candidate.repository,prompt:"Plan the exact candidate",candidate},decision);
 if(!plan.routeEvidence)throw new Error("Candidate-bound orchestration did not issue route evidence");
 return plan.routeEvidence;
}

/** Admits genuine route provenance with caller-readable evidence metadata. */
export function admitRouteEvidence(
 store:EvidenceStore,candidate:Candidate,
 metadata:RouteDecisionMetadata={id:"route",summary:"Genuine orchestration route",createdAt:"now"},
 taskId="route-evidence",
):Evidence{
 return store.addRouteDecision(candidate,genuineRouteEvidence(candidate,taskId),metadata);
}
