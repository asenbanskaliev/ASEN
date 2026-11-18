/** T06: validar el traspaso histórico antes de solicitar nuevas aprobaciones.
 * No se ejecuta código del candidato ni se llama a NVIDIA. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {lstatSync,readFileSync,realpathSync} from "node:fs";
import {join} from "node:path";
import {
 T06_REPLAY_SOURCE_RUN,T06_REPLAY_SOURCE_SHA
} from "../src/runtime/agents/t06-review-replay.js";
import {verifyT06IndependentReviewInputs} from
 "../src/runtime/agents/t06-independent-review-admission.js";
const root=process.env.ASEN_T06_REVIEW_CODE_DIR??"";
const behaviorRoot=process.env.ASEN_T06_REVIEW_BEHAVIOR_DIR??"";
const current=process.env.ASEN_T06_EXPECTED_SHA??"";
const json=(file:string,max:number):unknown=>{
 const stat=lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>max)
  throw Error("T06: informe original no fiable");
 return JSON.parse(readFileSync(file,"utf8")) as unknown;
};
assert.equal(process.env.GITHUB_ACTIONS,"true");
assert.equal(process.env.GITHUB_REPOSITORY,"asenbanskaliev/ASEN");
assert.equal(process.env.GITHUB_EVENT_NAME,"workflow_dispatch");
assert.equal(process.env.GITHUB_ACTOR,"asenbanskaliev");
assert.equal(process.env.GITHUB_REF,"refs/heads/feat/flujo-de-agentes-20261115");
assert.equal(process.env.GITHUB_RUN_ATTEMPT,"1");
assert.equal(process.env.GITHUB_SHA,current);
assert.match(current,/^[a-f0-9]{40}$/u);
assert.equal(process.env.ASEN_T06_COST_ACK,"true");
assert.equal(process.env.ASEN_T06_SOURCE_SHA,T06_REPLAY_SOURCE_SHA);
assert.equal(process.env.ASEN_T06_SOURCE_RUN_ID,String(T06_REPLAY_SOURCE_RUN));
assert.ok(root.startsWith("/")&&behaviorRoot.startsWith("/"));
assert.equal(execFileSync("git",["rev-parse","HEAD"],{
 encoding:"utf8",timeout:12000
}).trim(),current);
const candidate=realpathSync(join(realpathSync(root),"t06-codigo-aislado"));
const originalReport=json(join(root,"t06-dual-native-evidence.json"),100_000);
const manifest=json(join(candidate,"manifiesto.json"),5_000);
const isolatedReport=json(join(realpathSync(behaviorRoot),"t06-veredicto-aislado.json"),12_000);
const files:Record<string,Buffer>={};
for(const name of ["t06-writer-a.mjs","t06-writer-b.mjs"]){
 const file=join(candidate,name),stat=lstatSync(file);
 assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=10_000);
 assert.equal(realpathSync(file),file);
 files[name]=readFileSync(file);
}
const verdict=verifyT06IndependentReviewInputs({
 expectedSha:T06_REPLAY_SOURCE_SHA,report:originalReport,manifest,
 files,behavior:isolatedReport
});
assert.equal(verdict.allowed,true,verdict.reason);
assert.equal(verdict.globalFull,false);
process.stdout.write(JSON.stringify({
 sourceRunId:T06_REPLAY_SOURCE_RUN,sourceSha:T06_REPLAY_SOURCE_SHA,
 verifiedFiles:Object.keys(files).length,behaviorCases:17,globalFull:false
})+"\n");
