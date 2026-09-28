import assert from "node:assert/strict";
import test from "node:test";
import {randomBytes} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {recoveryKeyFromEnvironment} from "../src/session/recovery-key.js";
import {SkillLifecycle,saveLifecycle} from "../src/lifecycle/skill-lifecycle.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {saveEvidence} from "../src/evidence/persistence.js";
import {passingEvidence,gitCandidate} from "./execution-evidence-helper.js";
test("recovery signing key is supplied by host and survives process restart",()=>{
 const key=randomBytes(32),encoded=key.toString("base64url");
 assert.deepEqual(recoveryKeyFromEnvironment({ASEN_RECOVERY_KEY:encoded}),key);
 const child=spawnSync(process.execPath,["--import","tsx","-e",'import {recoveryKeyFromEnvironment} from "./src/session/recovery-key.ts";process.stdout.write(recoveryKeyFromEnvironment().toString("hex"))'],{encoding:"utf8",env:{...process.env,ASEN_RECOVERY_KEY:encoded}});
 assert.equal(child.status,0,child.stderr);
 assert.equal(child.stdout,key.toString("hex"));
});
test("recovery rejects missing, short, invalid and noncanonical secrets",()=>{
 for(const value of [undefined,"",randomBytes(16).toString("base64url"),"!".repeat(43),"A".repeat(42)+"B"])
  assert.throws(()=>recoveryKeyFromEnvironment(value===undefined?{}:{ASEN_RECOVERY_KEY:value}),/unavailable or malformed|malformed/);
});
test("new process restores signed lifecycle and evidence with host secret",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-cross-process-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 spawnSync("git",["init","-q",dir],{stdio:"ignore"});
 spawnSync("git",["-C",dir,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","initial"],{stdio:"ignore"});
 const candidate=gitCandidate("candidate",dir);
 const key=randomBytes(32),encoded=key.toString("base64url"),flowPath=join(dir,"flow.json"),evidencePath=join(dir,"evidence.json");
 const evidence=new EvidenceStore();
 await passingEvidence(evidence,candidate,"test");
 evidence.add(candidate,{id:"review",kind:"review",status:"pass",summary:"reviewed",createdAt:"now"});
 await saveLifecycle(flowPath,new SkillLifecycle("task",candidate).state,key);
 await saveEvidence(evidencePath,candidate,evidence,key);
 const fixture=resolve("tests/fixtures/recover-lifecycle.ts");
 const run=(env:NodeJS.ProcessEnv,revision=candidate.revision)=>spawnSync(process.execPath,["--import","tsx",fixture,flowPath,evidencePath,dir,revision],{cwd:resolve("."),encoding:"utf8",env:{...process.env,...env},timeout:20000});
 const resumed=run({ASEN_RECOVERY_KEY:encoded});assert.equal(resumed.status,0,resumed.stderr);
 assert.deepEqual(JSON.parse(resumed.stdout),{phase:"context-init",records:0,hasTest:true,hasReview:true});
 assert.match(run({ASEN_RECOVERY_KEY:randomBytes(32).toString("base64url")}).stderr,/integrity mismatch/);
 assert.match(run({ASEN_RECOVERY_KEY:encoded},"old").stderr,/identity mismatch/);
});
