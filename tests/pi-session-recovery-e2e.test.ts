import assert from "node:assert/strict";
import {spawnSync,type SpawnSyncReturns} from "node:child_process";
import {copyFileSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import test from "node:test";

const describeResult=(result:SpawnSyncReturns<string>)=>{
 const bounded=(value:string)=>value.length>2000?`${value.slice(0,2000)}… (${value.length} chars)`:value;
 return [
  `error=${result.error?`${result.error.name}: ${result.error.message}`:"none"}`,
  `signal=${result.signal??"none"}`,
  `status=${result.status??"null"}`,
  `stdout=${JSON.stringify(bounded(result.stdout))}`,
  `stderr=${JSON.stringify(bounded(result.stderr))}`
 ].join("\n");
};

test("real Pi session file and ASEN checkpoint resume across processes",t=>{
 const dir=mkdtempSync(join(tmpdir(),"asen-pi-recovery-"));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const fixture=resolve("tests/fixtures/pi-session-process.ts");
 const run=(mode:string,project="project-A",repo=dir,revision="revision-A")=>spawnSync(process.execPath,["--import","tsx",fixture,mode,dir,project,repo,revision],{encoding:"utf8",timeout:90000});
 const written=run("write");assert.equal(written.status,0,describeResult(written));
 const resumed=run("resume");assert.equal(resumed.status,0,describeResult(resumed));
 const state=JSON.parse(resumed.stdout);
 assert.equal(state.task.phase,"VERIFYING");
 assert.deepEqual(state.task.blockers,["needs review"]);
 assert.equal(state.candidate.id,state.task.candidateId);
 assert.equal(state.candidate.revision,"revision-A");
 assert.ok(state.piSessionId);
 assert.ok(state.piSessionFile);
 assert.equal(state.skillContext.phase,"verify");
 assert.equal(state.skillContext.candidateRevision,"revision-A");
 assert.deepEqual(state.skillPaths,["skills/asen-phase-protocol/SKILL.md","skills/asen-verify/SKILL.md"]);
 for(const [args,reason] of [
  [["resume","project-B"],/project mismatch/],
  [["resume","project-A","other-repo"],/repository mismatch/],
  [["resume","project-A",dir,"revision-B"],/revision changed/]
 ] as const){const rejected=run(...(args as unknown as [string,string,string,string]));assert.match(rejected.stderr,reason,describeResult(rejected));}
 const metadataPath=join(dir,"metadata.json"),original=readFileSync(metadataPath,"utf8"),metadata=JSON.parse(original);
 writeFileSync(metadataPath,JSON.stringify({...metadata,sessionId:"stale-session"}));
 const staleSession=run("resume");assert.match(staleSession.stderr,/Pi session identity mismatch/,describeResult(staleSession));
 const copied=join(dir,"copied-session.jsonl");copyFileSync(metadata.sessionFile,copied);
 writeFileSync(metadataPath,JSON.stringify({...metadata,sessionFile:copied}));
 const copiedSession=run("resume");assert.match(copiedSession.stderr,/Pi session file mismatch/,describeResult(copiedSession));
 writeFileSync(metadataPath,original);
});
