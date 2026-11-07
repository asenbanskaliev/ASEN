import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import test from "node:test";

const root=new URL("../",import.meta.url);
const read=(path:string)=>JSON.parse(readFileSync(new URL(path,root),"utf8"));
const digest=(value:Buffer|string)=>createHash("sha256").update(value).digest("hex");
const committed=(path:string)=>execFileSync("git",["show",`:${path}`],{encoding:"buffer",maxBuffer:32*1024*1024});
const matrix=read("docs/audit/eco01-functional-parity-matrix-2026-10-16.json");
const evidencePath=matrix.currentCandidateEvidence.todoRegistrationEvidence.path;
const evidence=read(evidencePath);

test("ECO-01 Todo registration evidence binds real Pi RPC runs and committed logs",()=>{
 const reference=matrix.currentCandidateEvidence.todoRegistrationEvidence;
 assert.equal(evidence.schema,"asen.eco01.todo-registration-pair.v1");
 assert.equal(evidence.source.commit,matrix.sourceCommit);
 assert.equal(evidence.source.fileSha256,"db4bcc80b9e41a23a37285e4dd31de67a496a72fef16aa7711cd601daec0b25d");
 assert.equal(evidence.asen.commit,matrix.asenCandidateCommit);
 assert.equal(evidence.asen.tree,reference.asenTree);
 assert.equal(evidence.execution.modelsInvoked,0);
 assert.equal(evidence.execution.networkMode,"offline");
 assert.equal(evidence.execution.runs.length,2);
 assert.deepEqual(evidence.execution.runs.map((run:any)=>run.piVersion),["0.87.1","1.1.0"]);
 assert.deepEqual(evidence.execution.runs.map((run:any)=>run.toolNames),[["todo"],["asen_todo_accept_result","asen_todo_add","asen_todo_inspect_interrupted_write","asen_todo_list","asen_todo_update"]]);
 assert.ok(evidence.execution.runs.every((run:any)=>run.exitCode===0&&!run.timedOut));
 assert.equal(evidence.scenario.name,"registration");
 assert.equal(evidence.scenario.classification,"INTENTIONAL");
 assert.equal(digest(committed(evidencePath)),reference.sha256);
 for(const run of evidence.execution.runs){
  assert.equal(digest(committed(`${evidencePath.slice(0,evidencePath.lastIndexOf("/"))}/${run.stdout.file}`)),run.stdout.sha256);
  assert.equal(digest(committed(`${evidencePath.slice(0,evidencePath.lastIndexOf("/"))}/${run.stderr.file}`)),run.stderr.sha256);
 }
 const contract=matrix.contracts.find((row:any)=>row.id===evidence.contractId);
 assert.equal(contract.scenarios.find((row:any)=>row.name==="registration").status,"INTENTIONAL");
 assert.equal(contract.scenarios.find((row:any)=>row.name==="registration").evidence.evidenceSha256,reference.sha256);
});
