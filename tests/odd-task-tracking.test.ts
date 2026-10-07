import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {SqliteMemoryStore} from "../src/memory/sqlite-store.js";
import {createMemoryContext} from "../src/memory/context.js";
import {deriveOddExecutionContract} from "../src/flow/odd-execution-contract.js";
import {trackOddTask,resumeOddTask,appendOddTaskEvent} from "../src/flow/odd-task-tracking.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {issueOddDecision} from "./helpers/odd-routing.js";
const progress={todos:[{id:"one",text:"Implement contract",status:"pending" as const}],nextStep:"Run focused tests"};
function contract(repository:string,readOnly=false,revision="sha",taskId="task"){
 const candidate={id:"candidate",repository,revision,createdAt:"now"};
 const decision=issueOddDecision({taskId,repository,intent:readOnly?"analysis":"implementation",paths:["src/a","src/b"],writes:readOnly?[]:[{path:"src/a",changeKind:"behavior"},{path:"src/b",changeKind:"behavior"}],estimatedMinutes:90});
 buildOrchestrationPlan({taskId,repository,candidate,prompt:"inspect"},decision);
 return deriveOddExecutionContract(decision);
}
async function fixture(t:{after:(f:()=>Promise<void>)=>void},close:()=>void=()=>{}){
 const root=await realpath(await mkdtemp(join(tmpdir(),"asen-odd-tracking-")));t.after(async()=>{close();await rm(root,{recursive:true,force:true});});
 await mkdir(join(root,"odd/tasks"),{recursive:true});await writeFile(join(root,"odd/tasks/task.md"),"\ufeff# Task\r\n\r\nScope, acceptance, constraints, TODO and resume context: á 🚛.\r\n");
 return root;
}
test("read-only substantial ODD produces no artifact and invokes no memory callbacks",async t=>{
 const root=await fixture(t),before=await readdir(root),c=contract(root,true);
 assert.equal(c.substantial,true);assert.equal(c.readOnly,true);assert.equal(c.artifactPolicy,"none");
 assert.equal(c.requiresFullMemoryMirror||c.requiresTodo||c.requiresResume,false);
 assert.equal(await trackOddTask(c,null as never,"unavailable",null as never),undefined);
 assert.equal(await resumeOddTask(c,{get(){throw new Error("read-only memory callback");}}),undefined);
 assert.deepEqual(await readdir(root),before);
});
test("full task mirror, TODO and exact resume survive SQLite close/reopen",async t=>{
 let openStore:SqliteMemoryStore|undefined;
 const root=await fixture(t,()=>openStore?.close()),path=join(root,"memory.db"),store=openStore=new SqliteMemoryStore(path),context=createMemoryContext(store,{repository:root},"first");
 const original=await readFile(join(root,"odd/tasks/task.md"),"utf8"),c=contract(root);
 assert.ok(c.requiresFullMemoryMirror&&c.requiresTodo&&c.requiresResume);
 const saved=await trackOddTask(c,context,"odd/tasks/task.md",progress);assert.ok(saved);
 assert.equal(JSON.parse(saved.content).document,original);
 await assert.rejects(()=>trackOddTask(c,context,"odd/tasks/task.md",progress),/consumed/);
 store.close();openStore=undefined;const reopened=openStore=new SqliteMemoryStore(path);
 const resumed=await resumeOddTask(contract(root),reopened);assert.ok(resumed);
 assert.equal(resumed.document,original);assert.deepEqual(resumed.todos,progress.todos);assert.equal(resumed.nextStep,progress.nextStep);
 assert.ok(Object.isFrozen(resumed)&&Object.isFrozen(resumed.todos)&&Object.isFrozen(resumed.todos[0]));
 for(const key of ["writerAdmission","phaseGrant","approval","merge","release","delivery"])assert.equal(key in resumed,false);
 await assert.rejects(()=>resumeOddTask(contract(root,false,"different"),reopened),/candidate mismatch/);
 assert.equal(await resumeOddTask(contract(root,false,"sha","other"),reopened),undefined);
 await writeFile(join(root,"odd/tasks/task.md"),"# Changed\n");await assert.rejects(()=>resumeOddTask(contract(root),reopened),/document changed/);
});
test("task replay appends to the same ODD memory record and resumes after restart",async t=>{
 let openStore:SqliteMemoryStore|undefined;
 const root=await fixture(t,()=>openStore?.close()),db=join(root,"memory.db"),store=openStore=new SqliteMemoryStore(db),context=createMemoryContext(store,{repository:root},"first");
 const c=contract(root),saved=await trackOddTask(c,context,"odd/tasks/task.md",progress);assert.ok(saved);
 const base={taskId:"task",sessionId:"first",projectId:root,at:"2026-10-06T00:00:01Z"};
 await assert.rejects(()=>appendOddTaskEvent(c,context,store,{...base,sessionId:"forged",revision:1,state:"planned"}),/session mismatch/);
 await appendOddTaskEvent(c,context,store,{...base,revision:1,state:"planned"});
 await appendOddTaskEvent(c,context,store,{...base,revision:2,state:"running",at:"2026-10-06T00:00:02Z"});
 await assert.rejects(()=>appendOddTaskEvent(c,context,store,{...base,revision:2,state:"running",at:"2026-10-06T00:00:03Z"}),/revision conflict/);
 store.close();openStore=undefined;
 const reopened=openStore=new SqliteMemoryStore(db),continued=createMemoryContext(reopened,{repository:root},"continued"),resumed=await resumeOddTask(contract(root),reopened);
 assert.equal(resumed?.taskEvents.length,2);assert.equal(resumed?.taskEvents[1]?.state,"running");
 const finished=await appendOddTaskEvent(contract(root),continued,reopened,{...base,revision:3,state:"done",at:"2026-10-06T00:00:03Z"});assert.equal(finished?.taskEvents.length,3);
 assert.equal(reopened.exportProject(root).observations.length,1);
});
test("tracking rejects forgery, wrong project, duplicate TODO and extras without document writes",async t=>{
 let openStore:SqliteMemoryStore|undefined;
 const root=await fixture(t,()=>openStore?.close()),store=openStore=new SqliteMemoryStore(join(root,"memory.db"));
 const context=createMemoryContext(store,{repository:root},"first"),original=await readFile(join(root,"odd/tasks/task.md"),"utf8");
 await assert.rejects(()=>trackOddTask({...contract(root)},context,"odd/tasks/task.md",progress),/genuine/);
 const wrong=createMemoryContext(store,{repository:"other"},"second");await assert.rejects(()=>trackOddTask(contract(root),wrong,"odd/tasks/task.md",progress),/project mismatch/);
 for(const p of [{...progress,todos:[...progress.todos,...progress.todos]},{...progress,authority:true},{...progress,nextStep:"bad\u0000"},{...progress,todos:[]}])await assert.rejects(()=>trackOddTask(contract(root),context,"odd/tasks/task.md",p));
 await assert.rejects(()=>trackOddTask(contract(root),context,"../outside.md",progress),/bounded/);
 assert.equal(await readFile(join(root,"odd/tasks/task.md"),"utf8"),original);assert.equal(store.exportProject(root).observations.length,0);
});
