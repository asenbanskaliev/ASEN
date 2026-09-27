import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import test from "node:test";

test("checkpoint survives process exit and rejects stale ownership, candidate and revision",t=>{
 const dir=mkdtempSync(join(tmpdir(),"asen-checkpoint-e2e-"));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,"checkpoint.json"),fixture=resolve("tests/fixtures/checkpoint-process.ts");
 const run=(mode:string,project="project-a",session="session-a",repo="repository-a",revision="sha-a")=>
  spawnSync(process.execPath,["--import","tsx",fixture,mode,path,project,session,repo,revision],{encoding:"utf8",timeout:10000});
 const written=run("write");assert.equal(written.status,0,written.stderr);
 const read=run("read");assert.equal(read.status,0,read.stderr);
 const restored=JSON.parse(read.stdout);
 assert.equal(restored.task.phase,"VERIFYING");
 assert.deepEqual(restored.task.blockers,["review pending"]);
 assert.equal(restored.task.candidateId,restored.candidate.id);
 assert.equal(restored.candidate.revision,"sha-a");
 assert.equal("evidence" in restored,false,"old evidence must be verified again after restart");
 for(const [args,reason] of [
  [["read","project-b"],/project mismatch/],
  [["read","project-a","session-b"],/session mismatch/],
  [["read","project-a","session-a","repository-b"],/repository mismatch/],
  [["read","project-a","session-a","repository-a","sha-b"],/revision changed/]
 ] as const){
  const rejected=run(...(args as unknown as [string,string,string,string,string]));
  assert.notEqual(rejected.status,0,`stale checkpoint accepted: ${args.join(" ")}`);
  assert.match(rejected.stderr,reason,`wrong failure cause: ${args.join(" ")}`);
 }
 const corrupt=JSON.parse(readFileSync(path,"utf8"));
 corrupt.candidate.id="different-candidate";
 writeFileSync(path,JSON.stringify(corrupt));
 assert.match(run("read").stderr,/candidate mismatch/,"candidate mismatch must cause rejection");
 writeFileSync(path,"{truncated");
 assert.match(run("read").stderr,/SyntaxError/,"partial checkpoint must cause rejection");
});
