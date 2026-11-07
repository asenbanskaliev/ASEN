import assert from "node:assert/strict";
import test from "node:test";
import {issueOddDecision} from "./helpers/odd-routing.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {materializeExecutablePlan} from "../src/orchestration/executable-plan.js";

const repository="/project";
const candidate={id:"f1-candidate",repository,revision:"a".repeat(40),createdAt:"2026-11-03T00:00:00Z"};
for(const [id,intent] of [["reviewers","implementation"],["verifier","verification"]] as const){
 test(`EF-103 authentic orchestration binds ${id} to the exact candidate revision`,()=>{
  const decision=issueOddDecision({taskId:id,repository,intent,reviewKind:id==="reviewers"?"dual_explicit":"none",
   paths:["src/a.ts","src/b.ts"]});
  const plan=buildOrchestrationPlan({taskId:id,repository,prompt:"Assess the candidate",candidate},decision);
  const graph=materializeExecutablePlan(plan,"Assess the candidate");
  const applicable=graph.tasks.filter(task=>task.role==="reviewer"||task.role==="verifier");
  assert.ok(applicable.length>0,"the selected route must contain a review role");
  assert.ok(applicable.every(task=>task.candidateRevision===candidate.revision),
   "all independent review tasks must carry a candidate-bound revision");
  assert.ok(applicable.every(task=>task.authorization==="required_before_dispatch"));
  assert.ok(applicable.every(task=>!Object.hasOwn(task,"writeSurfaces")));
  assert.deepEqual(applicable.map(task=>task.role),
   id==="reviewers"?["reviewer","reviewer"]:["verifier"]);
 });
}
