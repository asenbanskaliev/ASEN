import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {PersistentAgentStore} from "../src/runtime/agent-store.js";

/**
 * ECO-06 crash boundary: the worker has already modified a real file when
 * its process disappears. Reopening the durable queue must never replay it.
 * A new write requires an independently authorized fresh dispatch.
 */
test("ECO-06 interrupted writer preserves partial edits but cannot replay authority",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-eco06-writer-crash-"));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,"agents.json"),target=join(dir,"work.txt");
 await writeFile(target,"before\n");
 const child=spawnSync(process.execPath,["--import","tsx","--input-type=module","-e",`
  import {PersistentAgentStore} from "./src/runtime/agent-store.ts";
  import {appendFile} from "node:fs/promises";
  const file=process.argv[1],target=process.argv[2];
  const {store}=await PersistentAgentStore.open(file);
  const request={id:"interrupted-writer",role:"worker",prompt:"Edit only work.txt",repository:"/repo",isolationKey:"session-a",
    candidate:{id:"candidate",repository:"/repo",revision:"revision"},writeSurfaces:["work.txt"],
    writerAdmission:{opaque:true}};
  await store.enqueueControlledWorker(request,{kind:"user",id:"pi:session-a"});
  await store.running("interrupted-writer",new Date().toISOString());
  await appendFile(target,"partially-applied\\n");
 `,file,target],{encoding:"utf8",timeout:30000,cwd:process.cwd()});
 assert.equal(child.status,0,`crash fixture failed: ${child.stderr}`);
 const before=await readFile(target,"utf8");
 assert.equal(before,"before\npartially-applied\n");
 const reopened=await PersistentAgentStore.open(file);
 const entry=await reopened.store.get("interrupted-writer","session-a","/repo");
 assert.equal(entry?.record.state,"interrupted");
 assert.equal(entry?.result,undefined);
 for(const field of ["candidate","writeSurfaces","writerAdmission","phaseGrant"]){
  assert.equal(Object.hasOwn(entry?.request??{},field),false,`${field} must not be restored`);
 }
 assert.equal(reopened.store.resumable(entry!),undefined);
 await assert.rejects(
  ()=>reopened.store.enqueueContinuation("interrupted-writer","session-a","/repo",{kind:"user",id:"pi:session-a"}),
  /cannot be resumed safely|fresh authority/
 );
 assert.equal(await readFile(target,"utf8"),before,"restart must not reapply partial edits");
 assert.equal((await reopened.store.list("session-a","/repo")).length,1,"no second execution admitted");
 const reopenedAgain=await PersistentAgentStore.open(file);
 assert.equal((await reopenedAgain.store.get("interrupted-writer","session-a","/repo"))?.record.state,"interrupted");
 assert.equal((await reopenedAgain.store.list("session-a","/repo")).length,1);
 await assert.rejects(()=>reopenedAgain.store.enqueue({id:"unauthorized-replay",role:"worker",prompt:"Edit again",repository:"/repo",isolationKey:"session-a",writeSurfaces:["work.txt"]},{kind:"user",id:"pi:session-a"}),/Authority-bearing agent requests cannot be serialized/);
 assert.equal(await readFile(target,"utf8"),before);
});
