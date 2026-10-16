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
const baseline=read("registry/parity/ecosystem-sources-v1.json");
const sourceRow=baseline.files.find((row:any)=>row.id==="ECO-SRC-91b70c5973297fbd");
const evidencePath=matrix.currentCandidateEvidence.todoClearEvidence.path;
const evidence=read(evidencePath);

test("ECO-01 Todo clear maps to active-list removal with preserved ASEN archive",()=>{
 const reference=matrix.currentCandidateEvidence.todoClearEvidence;
 assert.equal(evidence.schema,"asen.eco01.todo-clear-pair.v1");
 assert.equal(evidence.source.commit,matrix.sourceCommit);
 assert.equal(evidence.source.sourceId,sourceRow.id);
 assert.equal(evidence.source.fileSha256,sourceRow.sha256);
 assert.equal(evidence.asen.commit,matrix.asenCandidateCommit);
 assert.equal(evidence.asen.tree,reference.asenTree);
 assert.equal(evidence.execution.exitCode,0);
 assert.equal(evidence.observation.classification,"INTENTIONAL");
 assert.equal(evidence.observation.source.activeTaskCount,0);
 assert.equal(evidence.observation.asen.activeTaskCount,0);
 assert.equal(evidence.observation.asen.archivedTaskCount,2);
 assert.equal(evidence.observation.asen.archiveHashes.length,1);
 assert.equal(digest(committed(evidencePath)),reference.sha256);
 for(const archive of evidence.observation.asen.archiveHashes)assert.equal(digest(committed(`${evidencePath.slice(0,evidencePath.lastIndexOf("/"))}/${archive.file}`)),archive.sha256);
 for(const side of ["source","asen"]){
  const logs=evidence.execution.logs[side];
  assert.equal(digest(committed(`${evidencePath.slice(0,evidencePath.lastIndexOf("/"))}/${logs.stdout.file}`)),logs.stdout.sha256);
  assert.equal(digest(committed(`${evidencePath.slice(0,evidencePath.lastIndexOf("/"))}/${logs.stderr.file}`)),logs.stderr.sha256);
 }
 const contract=matrix.contracts.find((row:any)=>row.id===evidence.contractId);
 assert.equal(contract.scenarios.find((row:any)=>row.name==="clear-and-archive").status,"INTENTIONAL");
 assert.equal(contract.scenarios.find((row:any)=>row.name==="clear-and-archive").evidence.evidenceSha256,reference.sha256);
 assert.equal(matrix.summary.scenarios,148);
 assert.equal(matrix.summary.statusCounts.INTENTIONAL,11);
 assert.equal(matrix.summary.statusCounts.UNVERIFIED,137);
});
