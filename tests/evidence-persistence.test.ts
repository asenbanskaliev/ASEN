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
 assert.equal(JSON.parse(await readFile(path,"utf8")).value.version,2);
 for(const other of [{...candidate,repository:"other"},{...candidate,id:"other"},{...candidate,revision:"other"},{...candidate,createdAt:"other"}])
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
test("v2 rejects re-signed exact-shape and semantic tampering",async t=>{const dir=await mkdtemp(join(tmpdir(),"asen-evidence-v2-"));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,"evidence.json"),key=randomBytes(32),store=new EvidenceStore();await passingReview(store,candidate,"review");await saveEvidence(path,candidate,store,key);const mutations=[(raw:any)=>raw.value.extra=true,(raw:any)=>raw.value.items[0].extra=true,(raw:any)=>raw.value.items[0].review.extra=true,(raw:any)=>raw.value.items[0].kind="lifecycle-completion",(raw:any)=>raw.value.items[0].candidateRevision="f".repeat(40)];for(const mutate of mutations){const raw=JSON.parse(await readFile(path,"utf8"));mutate(raw);raw.mac=createHmac("sha256",key).update("asen.evidence.v2\0").update(JSON.stringify(raw.value)).digest("hex");await writeFile(path,JSON.stringify(raw));await assert.rejects(()=>loadEvidence(path,candidate,key),/shape|semantics|completion|item mismatch|binding|review metadata/);await saveEvidence(path,candidate,store,key);}const extra=JSON.parse(await readFile(path,"utf8"));extra.extra=true;await writeFile(path,JSON.stringify(extra));await assert.rejects(()=>loadEvidence(path,candidate,key),/envelope shape/);});

test("save rejects accessors, prototypes, and sparse arrays without invoking accessors",async()=>{const store=new EvidenceStore(),key=randomBytes(32);let invoked=false;const accessor={...candidate};Object.defineProperty(accessor,"id",{enumerable:true,get(){invoked=true;return candidate.id;}});await assert.rejects(()=>saveEvidence("unused",accessor,store,key),/shape/);assert.equal(invoked,false);await assert.rejects(()=>saveEvidence("unused",Object.assign(Object.create({}),candidate),store,key),/plain data/);const command:string[]=[];command.length=1;store.add(candidate,{id:"sparse",kind:"command",status:"fail",summary:"sparse",createdAt:"now",execution:{command,cwd:candidate.repository,exitCode:1,startedAt:"a",finishedAt:"b"}});await assert.rejects(()=>saveEvidence("unused",candidate,store,key),/exact array/);});

test("a correctly signed legacy review without reviewer execution is rejected",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-review-recovery-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,"evidence.json"),key=randomBytes(32);
 const value={version:1,candidate,items:[{id:"forged",kind:"review",status:"pass",summary:"forged",createdAt:"now",candidateRepository:candidate.repository,candidateId:candidate.id,candidateRevision:candidate.revision}]};
 const mac=createHmac("sha256",key).update(JSON.stringify(value)).digest("hex");
 await writeFile(path,JSON.stringify({value,mac}));
 await assert.rejects(()=>loadEvidence(path,candidate,key),/review evidence lacks authenticated provenance/);
});
test("legacy v1 is audit-readable but resaves only as v2",async t=>{const dir=await mkdtemp(join(tmpdir(),"asen-evidence-v1-"));t.after(()=>rm(dir,{recursive:true,force:true}));const source=join(dir,"v1.json"),target=join(dir,"v2.json"),key=randomBytes(32),value={version:1,candidate,items:[]},mac=createHmac("sha256",key).update(JSON.stringify(value)).digest("hex");await writeFile(source,JSON.stringify({value,mac}));const restored=await loadEvidence(source,candidate,key);assert.equal(restored.hasPassing(candidate,"lifecycle-completion"),false);await saveEvidence(target,candidate,restored,key);assert.equal(JSON.parse(await readFile(target,"utf8")).value.version,2);});
