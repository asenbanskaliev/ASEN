import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import test from "node:test";

test("real Pi session file and ASEN checkpoint resume across processes",t=>{
 const dir=mkdtempSync(join(tmpdir(),"asen-pi-recovery-"));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const fixture=resolve("tests/fixtures/pi-session-process.ts");
 const run=(mode:string,project="project-A",repo=dir,revision="revision-A")=>spawnSync(process.execPath,["--import","tsx",fixture,mode,dir,project,repo,revision],{encoding:"utf8",timeout:25000});
 const written=run("write");assert.equal(written.status,0,written.stderr);
 const resumed=run("resume");assert.equal(resumed.status,0,resumed.stderr);
 const state=JSON.parse(resumed.stdout);
 assert.equal(state.task.phase,"VERIFYING");
 assert.deepEqual(state.task.blockers,["needs review"]);
 assert.equal(state.candidate.id,state.task.candidateId);
 assert.equal(state.candidate.revision,"revision-A");
 assert.ok(state.piSessionId);
 assert.ok(state.piSessionFile);
 for(const [args,reason] of [
  [["resume","project-B"],/project mismatch/],
  [["resume","project-A","other-repo"],/repository mismatch/],
  [["resume","project-A",dir,"revision-B"],/revision changed/]
 ] as const){const rejected=run(...(args as unknown as [string,string,string,string]));assert.match(rejected.stderr,reason);}
});
