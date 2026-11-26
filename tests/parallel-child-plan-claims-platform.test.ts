import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {ParallelChildPlanClaimJournal} from "../src/runtime/agents/parallel-child-plan-claims.js";
import type {ParallelChildSessionLink} from "../src/runtime/agents/parallel-todo-session-links.js";
test("T06 las reclamaciones usan identidad de ruta según el sistema operativo",async t=>{
 const dir=mkdtempSync(join(tmpdir(),"asen-claim-case-"));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const journal=new ParallelChildPlanClaimJournal(join(dir,"claims.json"));
 const source=join(dir,"fuente");
 const link=(id:string,root:string):ParallelChildSessionLink=>({
  batchId:"lote",sourceSessionId:"padre",sourceProjectId:source,
  sourceTodoId:"todo-"+id,sourceRequestId:"asen-plan:todo-"+id+":worker",
  sourceTodoRevision:1,childSessionId:"hijo-"+id,childProjectId:root,
  sourceHead:"a".repeat(40),attachedAt:new Date().toISOString(),
  authority:"none",autoDispatch:false,autoMerge:false
 });
 const a=link("a",join(dir,"Child")),b=link("b",join(dir,"child"));
 await journal.claim(a);
 if(process.platform==="win32")await assert.rejects(()=>journal.claim(b),/previously claimed/u);
 else{
  await journal.claim(b);
  assert.deepEqual((await journal.listSource({sessionId:"padre",projectId:source},[a,b]))
   .map(x=>x.sourceTodoId),["todo-a","todo-b"]);
 }
 await assert.rejects(()=>journal.claim(a),/previously claimed/u);
});
