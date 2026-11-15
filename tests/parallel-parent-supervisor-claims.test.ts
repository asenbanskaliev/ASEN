import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {ParentSupervisorClaimJournal} from "../src/runtime/agents/parallel-parent-supervisor-claims.js";

function fixture(t:TestContext){
 const dir=resolve(mkdtempSync(join(tmpdir(),"asen-t06-parent-supervisor-")));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 return {journal:new ParentSupervisorClaimJournal(join(dir,"claims.json")),file:join(dir,"claims.json")};
}
const source={sessionId:"source-pi-t06",projectId:resolve(tmpdir(),"asen-parent-pi")};
const children=[
 {sourceTodoId:"source-a",childTodoId:"child-a",childSessionId:"pi-a",childProjectId:resolve(tmpdir(),"asen-t06-a")},
 {sourceTodoId:"source-b",childTodoId:"child-b",childSessionId:"pi-b",childProjectId:resolve(tmpdir(),"asen-t06-b")}
];
const request={source,batchId:"source-batch-1",children};

test("T06 batch intent is durable, exact source-owned, and never grants Writer or retry",async t=>{
 const {journal,file}=fixture(t);
 const claimed=await journal.claim(request);
 assert.equal(claimed.status,"claimed-not-verified");
 assert.equal(claimed.grantsAuthority,false);assert.equal(claimed.autoRetry,false);assert.equal(claimed.autoMerge,false);
 assert.equal(claimed.children.length,2);
 const stored=JSON.parse(readFileSync(file,"utf8")) as {schema:string;revision:number;claims:unknown[]};
 assert.equal(stored.schema,"asen.parallel-supervisor-claims/v1");
 assert.equal(stored.revision,1);assert.equal(stored.claims.length,1);
 assert.deepEqual(await journal.listSource(source),[claimed]);
 assert.deepEqual(await journal.listSource({...source,sessionId:"other-pi"}),[]);
 assert.deepEqual(await journal.listSource({...source,projectId:resolve(tmpdir(),"foreign-repo")}),[]);
});

test("T06 one-shot source authorization cannot be replayed after an ambiguous shutdown",async t=>{
 const {journal}=fixture(t);
 await journal.claim(request);
 await assert.rejects(()=>journal.claim(request),/previously claimed/u);
 assert.equal((await journal.listSource(source)).length,1);
});

test("T06 two simultaneous supervisors cannot claim the same child sessions",async t=>{
 const {journal}=fixture(t);
 const results=await Promise.allSettled([journal.claim(request),journal.claim(request)]);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
 assert.equal(results.filter(r=>r.status==="rejected").length,1);
 assert.equal((await journal.listSource(source)).length,1);
});

test("T06 journal fails closed on malformed children, duplicate worktree or corrupt disk",async t=>{
 const {journal,file}=fixture(t);
 await assert.rejects(()=>journal.claim({
  ...request,children:[children[0]!,{...children[1]!,childProjectId:children[0]!.childProjectId}]
 }),/duplicate/u);
 await assert.rejects(()=>journal.claim({
  ...request,children:[children[0]!,{...children[1]!,sourceTodoId:children[0]!.sourceTodoId}]
 }),/duplicate/u);
 assert.equal((await journal.listSource(source)).length,0);
 writeFileSync(file,'{"schema":"corrupted","revision":0,"claims":[]}\n');
 await assert.rejects(()=>journal.claim(request),/Invalid one-shot supervisor claim journal/u);
 await assert.rejects(()=>journal.listSource(source),/Invalid one-shot supervisor claim journal/u);
 assert.equal(JSON.parse(readFileSync(file,"utf8")).schema,"corrupted");
});
