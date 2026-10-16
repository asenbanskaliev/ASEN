import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import test from "node:test";

const root=new URL("../",import.meta.url);
const read=(path:string)=>JSON.parse(readFileSync(new URL(path,root),"utf8"));
const digest=(value:Buffer|string)=>createHash("sha256").update(value).digest("hex");
const matrix=read("docs/audit/eco01-functional-parity-matrix-2026-10-16.json");
const baseline=read("registry/parity/ecosystem-sources-v1.json");
const edge=baseline.files.find((row:any)=>row.id==="ECO-SRC-91b70c5973297fbd");
const evidencePath=matrix.currentCandidateEvidence.todoPairEvidence.path;
const evidence=read(evidencePath);
const authorization=matrix.currentCandidateEvidence.todoAuthorizationEvidence;
const authorizationEvidence=read(authorization.path);
const sourceRepository=process.env.ECOSYSTEM_BASELINE_REPOSITORY;
const committed=(path:string)=>execFileSync("git",["show",`:${path}`],{encoding:"buffer",maxBuffer:32*1024*1024});

test("ECO-01 Todo observations bind exact source, ASEN tree, and raw logs",{skip:!sourceRepository},()=>{
 const git=(...args:string[])=>execFileSync("git",["-C",sourceRepository!,...args],{encoding:"buffer",maxBuffer:32*1024*1024});
 assert.equal(evidence.schema,"asen.eco01.todo-pair.v1");
 assert.equal(evidence.source.commit,baseline.commit);
 assert.equal(evidence.source.sourceId,edge.id);
 assert.equal(evidence.source.fileSha256,edge.sha256);
 assert.equal(digest(git("show",`${baseline.commit}:${edge.path}`)),edge.sha256);
 assert.equal(evidence.asen.commit,matrix.currentCandidateEvidence.todoPairEvidence.asenCommit);
 assert.equal(evidence.asen.tree,matrix.currentCandidateEvidence.todoPairEvidence.asenTree);
 assert.equal(digest(committed(evidencePath)),matrix.currentCandidateEvidence.todoPairEvidence.sha256);
 assert.equal(evidence.summary.overall,"UNVERIFIED");
 assert.equal(evidence.summary.statuses.EQUIVALENT,0);
 assert.equal(evidence.summary.statuses.INTENTIONAL,3);
 assert.equal(evidence.summary.statuses.UNVERIFIED,2);
 const logs=[evidence.execution.logs.stdout,evidence.execution.logs.stderr,{file:evidence.execution.focusedTests.source.log,sha256:evidence.execution.focusedTests.source.sha256},{file:evidence.execution.focusedTests.asen.log,sha256:evidence.execution.focusedTests.asen.sha256}];
 for(const log of logs){
  assert.equal(digest(committed(`${evidencePath.slice(0,evidencePath.lastIndexOf("/"))}/${log.file}`)),log.sha256);
 }
 for(const observation of evidence.observations){
  const bytes=committed(`${evidencePath.slice(0,evidencePath.lastIndexOf("/"))}/${observation.file}`);
  assert.equal(digest(bytes),observation.sha256);
 }
 const contract=matrix.contracts.find((row:any)=>row.id===evidence.contractId);
 assert.equal(contract.scenarios.find((row:any)=>row.name==="registration").status,"INTENTIONAL");
 assert.equal(contract.scenarios.find((row:any)=>row.name==="denied").status,"INTENTIONAL");
 assert.equal(contract.scenarios.find((row:any)=>row.name==="normal").status,"UNVERIFIED");
 assert.equal(contract.scenarios.find((row:any)=>row.name==="partial-failure").status,"UNVERIFIED");
 assert.equal(contract.scenarios.find((row:any)=>row.name==="invalid-input").status,"INTENTIONAL");
 assert.equal(contract.scenarios.find((row:any)=>row.name==="restart").status,"INTENTIONAL");
 assert.equal(contract.scenarios.find((row:any)=>row.name==="duplicate-request").status,"INTENTIONAL");
 assert.equal(authorizationEvidence.schema,"asen.eco01.todo-authorization-pair.v1");
 assert.equal(authorizationEvidence.source.commit,baseline.commit);
 assert.equal(authorizationEvidence.source.sourceId,edge.id);
 assert.equal(authorizationEvidence.source.fileSha256,edge.sha256);
 assert.equal(authorizationEvidence.asen.commit,authorization.asenCommit);
 assert.equal(authorizationEvidence.asen.tree,authorization.asenTree);
 assert.equal(digest(committed(authorization.path)),authorization.sha256);
 assert.equal(digest(committed(authorization.stdoutLog)),authorization.stdoutLogSha256);
 assert.equal(authorizationEvidence.scenario.name,"denied");
 assert.equal(authorizationEvidence.scenario.classification,"INTENTIONAL");
 assert.equal(authorizationEvidence.scenario.sourceResult.allowedMutation,true);
 assert.equal(authorizationEvidence.scenario.asenResult.deniedWithoutMutation,true);
 assert.equal(contract.scenarios.find((row:any)=>row.name==="denied").status,"INTENTIONAL");
 assert.equal(contract.scenarios.find((row:any)=>row.name==="denied").evidence.evidenceSha256,authorization.sha256);
 assert.equal(contract.scenarios.find((row:any)=>row.name==="registration").status,"INTENTIONAL");
 assert.equal(contract.scenarios.find((row:any)=>row.name==="registration").evidence.evidenceSha256,matrix.currentCandidateEvidence.todoRegistrationEvidence.sha256);
 assert.equal(matrix.summary.statusCounts.INTENTIONAL,11);
 assert.equal(matrix.summary.statusCounts.UNVERIFIED,137);
});
