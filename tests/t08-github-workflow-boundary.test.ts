import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";

const file=(path:string)=>readFileSync(path,"utf8");
test("T08 solo se inicia manualmente y exige el SHA exacto",()=>{
 const entry=file(".github/workflows/memory-openrouter-e2e.yml");
 const workflow=file(".github/workflows/t08-github-approved-fix.yml");
 assert.match(entry,/workflow_dispatch:/u);
 assert.match(entry,/\s+- t08\s/u);
 assert.match(entry,/inputs\.modo == 't08'/u);
 assert.match(entry,/uses: \.\/\.github\/workflows\/t08-github-approved-fix\.yml/u);
 assert.match(workflow,/workflow_call:/u);
 assert.doesNotMatch(workflow,/\n\s+push:|\n\s+pull_request:/u);
 assert.match(workflow,/github\.event_name == 'workflow_dispatch'/u);
 assert.match(workflow,/GITHUB_RUN_ATTEMPT" = 1/u);
 assert.match(workflow,/test "\$GITHUB_SHA" = "\$SHA_ESPERADO"/u);
 assert.match(workflow,/COSTE_AUTORIZADO" = true/u);
 assert.match(workflow,/T08 bloqueado: Nemotron 3 Ultra/u);
 assert.ok(workflow.includes('if [[ "$model" == "nvidia/nemotron-3-ultra-550b-a55b" ]]'));
 assert.match(workflow,/persist-credentials: false/u);
 assert.match(workflow,/cancel-in-progress: false/u);
});
test("T08 los jueces terminan antes del segundo permiso y Writer",()=>{
 const w=file(".github/workflows/t08-github-approved-fix.yml");
 const names=[
  "  preparar:","  aprobar-revisores:","  revisar:",
  "  aprobar-reparacion:","  reparar-y-revisar:"
 ];
 let last=-1;
 for(const name of names){
  const i=w.indexOf(name);
  assert.ok(i>last,name);last=i;
 }
 assert.match(w,/aprobar-revisores:\s+needs: \[preparar\][\s\S]*?name: asen-t08-revisores/u);
 assert.match(w,/revisar:\s+needs: \[aprobar-revisores\]/u);
 assert.match(w,/aprobar-reparacion:\s+needs: \[revisar\][\s\S]*?name: asen-t08-reparacion/u);
 assert.match(w,/reparar-y-revisar:\s+needs: \[aprobar-reparacion\]/u);
 assert.match(w,/actions\/download-artifact@[0-9a-f]{40}/u);
 assert.match(file("scripts/t08-github-real-fix.ts"),/requireLiveT08GithubApprovals/u);
});
test("T08 las claves solo aparecen después de aprobaciones protegidas",()=>{
 const w=file(".github/workflows/t08-github-approved-fix.yml");
 const pre=w.slice(w.indexOf("  preparar:"),w.indexOf("  aprobar-revisores:"));
 const review=w.slice(w.indexOf("  revisar:"),w.indexOf("  aprobar-reparacion:"));
 const fix=w.slice(w.indexOf("  reparar-y-revisar:"));
 assert.doesNotMatch(pre,/NVIDIA_API_KEY/u);
 assert.match(review,/NVIDIA_API_KEY: \$\{\{ secrets.NVIDIA_API_KEY \}\}/u);
 assert.match(fix,/NVIDIA_API_KEY: \$\{\{ secrets.NVIDIA_API_KEY \}\}/u);
 assert.match(review,/permissions:\s+contents: read\s+actions: read/u);
 assert.match(fix,/permissions:\s+contents: read\s+actions: read/u);
 assert.doesNotMatch(w,/pull-requests: write|contents: write|id-token: write/u);
 const script=file("scripts/t08-github-real-fix.ts");
 assert.match(script,/runJudgmentDay/u);
 assert.match(script,/proposeJudgmentFixHandoff/u);
 assert.match(script,/JudgmentFixProposalJournal/u);
 assert.match(script,/draftOddFromStoredFix/u);
 assert.match(script,/validateFreshFixOddRequest/u);
 assert.match(script,/SessionTodoStore/u);
 assert.match(script,/inspectFixOddRecovery/u);
 assert.match(script,/PiProcessRunner/u);
 assert.match(script,/assessT06WriterEvidence/u);
 assert.match(script,/checkT08Behavior/u);
 assert.match(script,/requireLiveT08GithubApprovals\("fix"\)/u);
 assert.match(script,/globalFull:false/u);
});

test("T08 la entrada real falla sin SHA ni aprobación, sin gastar API ni escribir",()=>{
 for(const stage of ["review","fix"]){
  const child=spawnSync(process.execPath,["--import","tsx",
   "scripts/t08-github-real-fix.ts",stage],{
   cwd:process.cwd(),encoding:"utf8",timeout:20_000,
   env:{PATH:process.env.PATH,HOME:process.env.HOME,
    ASEN_T08_EXPECTED_SHA:"",NVIDIA_API_KEY:"",
    GITHUB_ACTIONS:"false"}
  });
  assert.equal(child.status,1,child.stderr);
  assert.match(child.stderr,/T08 BLOQUEADO/u);
  assert.doesNotMatch(child.stderr,/nvapi-|NVIDIA_API_KEY=|Bearer [A-Za-z]/u);
 }
});
