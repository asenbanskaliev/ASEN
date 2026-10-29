import assert from "node:assert/strict";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";

const root=process.env.ASEN_T05_EVIDENCE_DIR;
const sha=process.env.ASEN_EXPECTED_SHA;
if(!root||!sha||!/^[a-f0-9]{40}$/.test(sha))throw new Error("Evidence directory and exact candidate SHA required");
mkdirSync(root,{recursive:true});
const evidence=JSON.parse(readFileSync(join(root,"live-cycle-evidence.json"),"utf8"));
assert.equal(evidence.schemaVersion,1);assert.equal(evidence.candidateSha,sha);assert.match(evidence.piVersion,/(?:^|\s)1\.2\.0(?:\s|$)/u);assert.equal(evidence.provider,"nvidia");assert.equal(typeof evidence.model,"string");
assert.deepEqual(evidence.allowedPaths,["docs/t04-t05-live-cycle.txt"]);assert.deepEqual(evidence.observedPaths,evidence.allowedPaths);
assert.equal(evidence.gitBefore.head,sha);assert.equal(evidence.gitBefore.status,"");assert.equal(evidence.gitAfter.head,evidence.correction.acceptedRevision);assert.equal(evidence.gitAfter.status,"");
assert.ok(evidence.initial.controllerPid>0);assert.ok(evidence.initial.piProcessId>0);assert.notEqual(evidence.initial.controllerPid,evidence.initial.piProcessId);assert.equal(evidence.initial.exit.signal,"SIGKILL");
assert.equal(evidence.initial.authorizationId,`${evidence.initial.taskId}:worker`);assert.equal(evidence.initial.authorizationConsumed,true);assert.equal(evidence.correction.authorizationId,`${evidence.correction.taskId}:worker`);assert.equal(evidence.correction.authorizationConsumed,true);assert.deepEqual(evidence.correction.allowedPaths,evidence.allowedPaths);
assert.equal(evidence.initial.recovery.state,"completed");assert.equal(evidence.initial.recovery.action,"do-not-replay");assert.equal(evidence.initial.replayExecutions,0);
assert.equal(evidence.firstReview.verdict.verdict,"fail");assert.ok(evidence.firstReview.verdict.findings.some((finding:{severity:string;path:string})=>finding.path===evidence.target&&(finding.severity==="critical"||finding.severity==="high")));
assert.equal(evidence.secondReview.verdict.verdict,"pass");assert.equal(evidence.secondReview.verdict.findings.some((finding:{severity:string})=>finding.severity==="critical"||finding.severity==="high"),false);
assert.notEqual(evidence.firstReview.taskId,evidence.secondReview.taskId);assert.notEqual(evidence.firstReview.sessionId,evidence.secondReview.sessionId);assert.notEqual(evidence.firstReview.piProcessId,evidence.secondReview.piProcessId);assert.notEqual(evidence.correction.piProcessId,evidence.firstReview.piProcessId);assert.notEqual(evidence.correction.piProcessId,evidence.secondReview.piProcessId);
assert.equal(evidence.acceptance.authority,"asen-deterministic-evidence-gate");assert.equal(evidence.acceptance.accepted,true);assert.equal(evidence.acceptance.acceptedRevision,evidence.correction.acceptedRevision);assert.match(evidence.acceptance.fileSha256,/^[a-f0-9]{64}$/u);
const common={candidateSha:sha,provider:evidence.provider,model:evidence.model,providerEvidence:"live-cycle-evidence.json",r4ScenarioEvidence:`t05-r4-execution-${sha}`,checkedAt:new Date().toISOString()};
const verdicts={
 T04:{...common,result:"FULL",reason:"Un escritor Pi/NVIDIA autorizado fue detenido después de completar su tool de escritura y antes de que ASEN persistiera un resultado terminal; un controlador nuevo recuperó la interrupción durable, reconcilió los bytes exactos y prohibió la repetición."},
 T05:{...common,result:"FULL",reason:"Un revisor Pi/NVIDIA separado y sin tools rechazó el candidato reconciliado exacto; una autorización nueva y acotada permitió corregirlo, otro proceso y sesión lo revisaron de nuevo, y solo la compuerta determinista ligada al SHA lo aceptó."}
};
writeFileSync(join(root,"t04-t05-verdicts.json"),JSON.stringify(verdicts,null,2)+"\n",{mode:0o600});
process.stdout.write(JSON.stringify(verdicts)+"\n");
