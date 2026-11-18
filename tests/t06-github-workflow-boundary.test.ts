import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const load=(file:string)=>readFileSync(file,"utf8");
const manual=load(".github/workflows/memory-openrouter-e2e.yml");
const protectedWriter=load(".github/workflows/t06-github-approved-writers.yml");
const runner=load("scripts/t06-nvidia-dual-writer-native.ts");

test("T06 GitHub NO se ejecuta por push, PR ni una actualización de código",()=>{
 assert.match(protectedWriter,/^on:\s*\n  workflow_call:/mu);
 assert.doesNotMatch(protectedWriter,/^  (?:push|pull_request|schedule|workflow_dispatch):/mu);
 assert.match(manual,/^  workflow_dispatch:\s*\n    inputs:/mu);
 assert.match(manual,/if: inputs\.modo == 't06'/u);
 assert.match(manual,/if: inputs\.modo == 'memoria'/u);
 assert.match(manual,/cost_acknowledged: /u);
});
test("T06 requiere dos aprobaciones individuales antes de ejecutar Writer",()=>{
 for(const part of ["name: asen-t06-writer-a","name: asen-t06-writer-b",
  "needs: [aprobar-a, aprobar-b]","actions: read",
  "scripts/t06-github-approval-gate.ts",
  'ASEN_T06_GITHUB_MODE: "1"',
  'ASEN_T06_COST_ACK:']){
  assert.ok(protectedWriter.includes(part),"Falta protección: "+part);
 }
 assert.ok(protectedWriter.indexOf("scripts/t06-github-approval-gate.ts")<
  protectedWriter.indexOf("scripts/t06-nvidia-dual-writer-native.ts"));
 assert.match(runner,/await requireLiveT06GithubApprovals\(\)/u);
 assert.match(runner,/requireDistinctT06Approvals\(intents/u);
 assert.match(runner,/else if\(!process\.stdin\.isTTY/u);
 assert.match(protectedWriter,/GITHUB_RUN_ATTEMPT.*1/u);
 assert.doesNotMatch(protectedWriter,/permissions:\s*\n\s*contents: write/mu);
});
test("T06 solicita cada aprobación humana por separado para evitar agrupaciones de GitHub",()=>{
 const first=protectedWriter.indexOf("  aprobar-a:");
 const second=protectedWriter.indexOf("  aprobar-b:");
 const execute=protectedWriter.indexOf("  ejecutar:");
 assert.ok(first>=0&&second>first&&execute>second);
 const a=protectedWriter.slice(first,second),b=protectedWriter.slice(second,execute);
 assert.match(a,/needs: \[preparar\]/u);
 assert.match(b,/needs: \[aprobar-a\]/u);
 assert.doesNotMatch(b,/needs: \[preparar\]/u);
 assert.match(protectedWriter.slice(execute),/needs: \[aprobar-a, aprobar-b\]/u);
});

test("T06 no incluye credenciales NVIDIA en preparación ni aprobación",()=>{
 const firstUse=protectedWriter.indexOf("NVIDIA_API_KEY:");
 const jobExecution=protectedWriter.indexOf("\n  ejecutar:");
 assert.ok(firstUse>0,"El secreto está declarado para workflow_call");
 assert.ok(jobExecution>firstUse);
 assert.equal(protectedWriter.slice(firstUse,jobExecution).includes("secrets.NVIDIA_API_KEY"),false);
 assert.match(protectedWriter.slice(jobExecution),/secrets\.NVIDIA_API_KEY/u);
 assert.match(protectedWriter,/persist-credentials: false/u);
 assert.match(protectedWriter,/timeout 420s/u);
 assert.match(protectedWriter,/if-no-files-found: warn/u);
});

test("T06 conecta el diario privado de autoría antes de abrir el Writer",()=>{
 const source=load("scripts/t06-nvidia-dual-writer-native.ts");
 const pi=load("src/agents/pi-process-runner.ts");
 const authority=load("extensions/authority.ts");
 assert.match(source,/mkdtempSync\(join\(tmpdir\(\),"asen-t06-attribution-"\)\)/u);
 assert.match(source,/const attributionFile=join\(attributionDir,"workspace.json"\)/u);
 assert.match(source,/PersistentWorkspaceStore\.open\(attributionFile\)/u);
 assert.match(source,/attributionFile,/u);
 assert.match(source,/verifyT06WorkspaceAttribution\(/u);
 assert.match(source,/assessment\.passed/u);
 assert.match(pi,/this\.options\.attributionFile/u);
 assert.match(authority,/!authority\.agentId\|\|!authority\.sessionId\|\|!authority\.attributionFile/u);
});

test("T09 solo lee el informe guardado y no sustituye el resultado del Writer",()=>{
 const source=load(".github/workflows/t06-github-approved-writers.yml");
 const script=load("scripts/t09-auditar-ensayo-t06.ts");
 const writerIndex=source.indexOf("scripts/t06-nvidia-dual-writer-native.ts");
 const analysisIndex=source.indexOf("scripts/t09-auditar-ensayo-t06.ts");
 const uploadIndex=source.indexOf("actions/upload-artifact@");
 assert.ok(writerIndex>=0&&analysisIndex>writerIndex&&uploadIndex>analysisIndex);
 assert.match(source,/name: Evaluar el informe T06 para T09[^]*?if: always\(\)/u);
 assert.match(source,/path: \$\{\{ runner.temp \}\}\/asen-t06-evidence\//u);
 assert.match(script,/assessT09NativeTrialReadiness/u);
 assert.doesNotMatch(script,/NVIDIA_API_KEY|OPENROUTER_API_KEY|fetch\(|spawn\(/u);
 assert.match(script,/providerUsageVerified:false,billingVerified:false/u);
 assert.match(script,/globalFull:false/u);
});

test("T11: cambios visuales de PR no ejecutan NVIDIA sin evento humano etiquetado",()=>{
 const ci=load(".github/workflows/ci.yml");
 assert.match(ci,/^  pull_request:\s*\n    types: \[opened, synchronize, reopened, labeled\]/mu);
 const first=ci.slice(ci.indexOf("\n  t06-nvidia-free-api:"),ci.indexOf("\n  t06-nvidia-pi-native:"));
 const second=ci.slice(ci.indexOf("\n  t06-nvidia-pi-native:"));
 for(const job of [first,second]){
  const boundary=job.split("\n    steps:")[0]??"";
  assert.match(boundary,/github\.event\.action == 'labeled'/u);
  assert.match(boundary,/github\.event\.label\.name == 'asen-t06-nvidia-una-vez'/u);
  assert.match(boundary,/github\.actor == 'asenbanskaliev'/u);
  assert.match(boundary,/github\.event\.pull_request\.number == 61/u);
  assert.match(boundary,/github\.head_ref == 'feat\/flujo-de-agentes-20261115'/u);
 }
 assert.match(second,/needs: \[t06-nvidia-free-api\]/u);
 assert.match(ci,/\n  push:\s*\n    branches: \[main\]/u);
 // Esta puerta NO sustituye dos aprobaciones protegidas ni las altera.
 assert.match(protectedWriter,/name: asen-t06-writer-a/u);
 assert.match(protectedWriter,/name: asen-t06-writer-b/u);
});

test("T06 agrupa dos Writers, 17 casos aislados y dos revisores sin permisos de escritura",()=>{
 const start=protectedWriter.indexOf("\n  comprobar-comportamiento-aislado:");
 const a=protectedWriter.indexOf("\n  aprobar-revisor-a:",start);
 const b=protectedWriter.indexOf("\n  aprobar-revisor-b:",a);
 const r=protectedWriter.indexOf("\n  revisar-independiente:",b);
 assert.ok(start>=0&&a>start&&b>a&&r>b);
 const sandbox=protectedWriter.slice(start,a);
 const reviewA=protectedWriter.slice(a,b);
 const reviewB=protectedWriter.slice(b,r);
 const reviews=protectedWriter.slice(r);
 assert.match(sandbox,/needs: \[ejecutar\]/u);
 assert.doesNotMatch(sandbox,/secrets\.NVIDIA_API_KEY|GITHUB_TOKEN:|ASEN_T06_REVIEW_MODEL_A:/u);
 assert.match(reviewA,/name: asen-t06-reviewer-a/u);
 assert.match(reviewA,/needs: \[comprobar-comportamiento-aislado\]/u);
 assert.match(reviewB,/name: asen-t06-reviewer-b/u);
 assert.match(reviewB,/needs: \[aprobar-revisor-a\]/u);
 assert.match(reviews,/needs: \[comprobar-comportamiento-aislado, aprobar-revisor-b\]/u);
 assert.match(reviews,/github\.run_attempt == 1/u);
 assert.match(reviews,/test "\$GITHUB_RUN_ATTEMPT" = 1/u);
 const gate=reviews.indexOf("scripts/t06-github-reviewer-approvals.ts");
 const approval=reviews.indexOf("requireLiveT06GithubReviewerApprovals()");
 const model=reviews.indexOf("scripts/t06-github-independent-review.ts");
 assert.equal(gate,-1);
 assert.ok(approval>=0&&model>approval);
 assert.match(reviews,/ASEN_T06_GITHUB_REVIEW_MODE: "1"/u);
 assert.match(reviews,/secrets\.NVIDIA_API_KEY/u);
 assert.doesNotMatch(reviews,/contents: write|pull-requests: write|git push|git merge/u);
 assert.match(manual,/reviewer_a: \$\{\{ inputs\.t06_revisor_a \}\}/u);
 assert.match(manual,/reviewer_b: \$\{\{ inputs\.t06_revisor_b \}\}/u);
 assert.match(reviews,/asen-t06-dos-writers-\$\{\{ inputs\.candidate_sha \}\}-\$\{\{ github\.run_id \}\}/u);
 assert.match(reviews,/asen-t06-pruebas-aisladas-\$\{\{ inputs\.candidate_sha \}\}-\$\{\{ github\.run_id \}\}/u);
});
test("T06 no activa revisores por PR ni reintento y conserva T08 separado",()=>{
 const entry=manual.replace(/\r\n/gu,"\n");
 assert.match(entry,/^          - t06$/mu);
 assert.match(entry,/^          - t08$/mu);
 assert.match(entry,/coste_desconocido_autorizado:/u);
 const source=load("scripts/t06-github-independent-review.ts");
 const reviewer=load("scripts/t06-native-independent-review.ts");
 assert.match(source,/verifyT06IndependentReviewInputs\(/u);
 assert.match(source,/requireLiveT06GithubReviewerApprovals\(\)/u);
 assert.match(source,/runT06NativeIndependentReviews\(/u);
 assert.match(source,/globalFull:false/u);
 assert.match(reviewer,/noTools:true,requireFinalSettlement:true/u);
 assert.match(reviewer,/if\(!githubReview\)/u);
 assert.match(reviewer,/await requireLiveT06GithubReviewerApprovals\(\)/u);
});
