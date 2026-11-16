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
 assert.match(manual,/if: inputs\.modo != 't06'/u);
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
