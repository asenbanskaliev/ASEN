import assert from "node:assert/strict";
import test from "node:test";
import {randomBytes,createHmac} from "node:crypto";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {EvidenceStore} from "../src/evidence/store.js";
import {gitCandidate,passingReview} from "./execution-evidence-helper.js";
import {loadEvidence,saveEvidence} from "../src/evidence/persistence.js";
const candidate=gitCandidate("candidate");
test("signed evidence survives restart only for exact candidate and signing key",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-evidence-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,"evidence.json"),key=randomBytes(32),store=new EvidenceStore();
 await passingReview(store,candidate,"review");
 await saveEvidence(path,candidate,store,key);
 const restored=await loadEvidence(path,candidate,key);
 assert.equal(restored.hasPassing(candidate,"review"),true);
 for(const other of [{...candidate,repository:"other"},{...candidate,id:"other"},{...candidate,revision:"other"}])
  await assert.rejects(()=>loadEvidence(path,other,key),/candidate mismatch/);
 await assert.rejects(()=>loadEvidence(path,candidate,randomBytes(32)),/integrity mismatch/);
 const raw=JSON.parse(await readFile(path,"utf8"));raw.value.items[0].status="fail";await writeFile(path,JSON.stringify(raw));
 await assert.rejects(()=>loadEvidence(path,candidate,key),/integrity mismatch/);
});
test("an unverified caller cannot restore a fabricated passing execution",()=>{
 const store=new EvidenceStore();
 const forged={id:"fake",kind:"test" as const,status:"pass" as const,summary:"fake",createdAt:"now",execution:{command:["node","test"],cwd:"repo",exitCode:0,startedAt:"now",finishedAt:"now"}};
 assert.equal("restoreSigned" in store,false);
 assert.throws(()=>store.add(candidate,forged),/requires executed proof/);
 assert.equal(store.hasPassing(candidate,"test"),false);
});
test("a correctly signed legacy review without reviewer execution is rejected",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-review-recovery-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,"evidence.json"),key=randomBytes(32);
 const value={version:1,candidate,items:[{id:"forged",kind:"review",status:"pass",summary:"forged",createdAt:"now",candidateRepository:candidate.repository,candidateId:candidate.id,candidateRevision:candidate.revision}]};
 const mac=createHmac("sha256",key).update(JSON.stringify(value)).digest("hex");
 await writeFile(path,JSON.stringify({value,mac}));
 await assert.rejects(()=>loadEvidence(path,candidate,key),/review evidence lacks authenticated provenance/);
});
