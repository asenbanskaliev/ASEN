import assert from "node:assert/strict";
import test from "node:test";
import {randomBytes} from "node:crypto";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {EvidenceStore} from "../src/evidence/store.js";
import {loadEvidence,saveEvidence} from "../src/evidence/persistence.js";
const candidate={id:"candidate",repository:"repo",revision:"sha",createdAt:"now"};
test("signed evidence survives restart only for exact candidate and signing key",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-evidence-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,"evidence.json"),key=randomBytes(32),store=new EvidenceStore();
 store.add(candidate,{id:"review",kind:"review",status:"pass",summary:"independent",createdAt:"now"});
 await saveEvidence(path,candidate,store,key);
 const restored=await loadEvidence(path,candidate,key);
 assert.equal(restored.hasPassing(candidate,"review"),true);
 for(const other of [{...candidate,repository:"other"},{...candidate,id:"other"},{...candidate,revision:"other"}])
  await assert.rejects(()=>loadEvidence(path,other,key),/candidate mismatch/);
 await assert.rejects(()=>loadEvidence(path,candidate,randomBytes(32)),/integrity mismatch/);
 const raw=JSON.parse(await readFile(path,"utf8"));raw.value.items[0].status="fail";await writeFile(path,JSON.stringify(raw));
 await assert.rejects(()=>loadEvidence(path,candidate,key),/integrity mismatch/);
});
