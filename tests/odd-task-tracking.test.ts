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
 assert.equal(await resumeOddTask(c,{get(){throw new Error("read-only memory callback");}},null as never),undefined);
 assert.deepEqual(await readdir(root),before);
});
test("full task mirror, TODO and exact resume survive SQLite close/reopen",async t=>{
 let openStore:SqliteMemoryStore|undefined;
 const root=await fixture(t,()=>openStore?.close()),path=join(root,"memory.db"),store=openStore=new SqliteMemoryStore(path),context=createMemoryContext(store,{repository:root},"first");
 const original=await readFile(join(root,"odd/tasks/task.md"),"utf8"),c=contract(root),firstContext=createMemoryContext(store,{repository:root},"first");
 assert.ok(c.requiresFullMemoryMirror&&c.requiresTodo&&c.requiresResume);
 const saved=await trackOddTask(c,context,"odd/tasks/task.md",progress);assert.ok(saved);
 assert.equal(JSON.parse(saved.content).document,original);
 await assert.rejects(()=>trackOddTask(c,context,"odd/tasks/task.md",progress),/consumed/);
 store.close();openStore=undefined;const reopened=openStore=new SqliteMemoryStore(path);
 const resumed=await resumeOddTask(contract(root),reopened,createMemoryContext(reopened,{repository:root},"first"));assert.ok(resumed);
 assert.equal(resumed.document,original);assert.deepEqual(resumed.todos,progress.todos);assert.equal(resumed.nextStep,progress.nextStep);
 assert.ok(Object.isFrozen(resumed)&&Object.isFrozen(resumed.todos)&&Object.isFrozen(resumed.todos[0]));
 for(const key of ["writerAdmission","phaseGrant","approval","merge","release","delivery"])assert.equal(key in resumed,false);
 await assert.rejects(()=>resumeOddTask(contract(root,false,"different"),reopened,firstContext),/candidate mismatch/);
 assert.equal(await resumeOddTask(contract(root,false,"sha","other"),reopened,firstContext),undefined);
 await assert.rejects(()=>resumeOddTask(contract(root),reopened,createMemoryContext(reopened,{repository:root},"another-session")),/session mismatch/);
 await writeFile(join(root,"odd/tasks/task.md"),"# Changed\n");await assert.rejects(()=>resumeOddTask(contract(root),reopened,firstContext),/document changed/);
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
 const reopened=openStore=new SqliteMemoryStore(db),continued=createMemoryContext(reopened,{repository:root},"continued"),sameSession=createMemoryContext(reopened,{repository:root},"first"),resumed=await resumeOddTask(contract(root),reopened,sameSession);
 assert.equal(resumed?.taskEvents.length,2);assert.equal(resumed?.taskEvents[1]?.state,"running");
 await assert.rejects(()=>appendOddTaskEvent(contract(root),continued,reopened,{...base,revision:3,state:"done",at:"2026-10-06T00:00:03Z"}),/session mismatch/);
 const finished=await appendOddTaskEvent(contract(root),sameSession,reopened,{...base,revision:3,state:"done",at:"2026-10-06T00:00:03Z"});assert.equal(finished?.taskEvents.length,3);
 assert.equal(reopened.exportProject(root).observations.length,1);
});
test("first durable replay event must bind the current ODD task and project",async t=>{
 let openStore:SqliteMemoryStore|undefined;
 const root=await fixture(t,()=>openStore?.close());
 const store=openStore=new SqliteMemoryStore(join(root,"memory.db")),context=createMemoryContext(store,{repository:root},"first"),c=contract(root);
 await trackOddTask(c,context,"odd/tasks/task.md",progress);
 const base={sessionId:"first",projectId:root,revision:1,state:"planned" as const,at:"2026-10-06T00:00:01Z"};
 await assert.rejects(()=>appendOddTaskEvent(c,context,store,{...base,taskId:"other"}),/task identity/i);
 await assert.rejects(()=>appendOddTaskEvent(c,context,store,{...base,taskId:"task",projectId:"other"}),/project identity/i);
 const unchanged=await resumeOddTask(contract(root),store,context);assert.deepEqual(unchanged?.taskEvents,[]);
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

test("competing ODD task events from independent memory clients cannot overwrite one another",async t=>{
 let first:SqliteMemoryStore|undefined,second:SqliteMemoryStore|undefined;
 const root=await fixture(t,()=>{first?.close();second?.close();}),db=join(root,"memory.db");
 first=new SqliteMemoryStore(db);const firstContext=createMemoryContext(first,{repository:root},"shared-session"),c=contract(root);
 await trackOddTask(c,firstContext,"odd/tasks/task.md",progress);
 const base={taskId:"task",sessionId:"shared-session",projectId:root,at:"2026-10-12T00:00:00Z"};
 await appendOddTaskEvent(c,firstContext,first,{...base,revision:1,state:"planned"});
 second=new SqliteMemoryStore(db);const secondContext=createMemoryContext(second,{repository:root},"shared-session");
 const results=await Promise.allSettled([appendOddTaskEvent(contract(root),firstContext,first,{...base,revision:2,state:"running"}),appendOddTaskEvent(contract(root),secondContext,second,{...base,revision:2,state:"cancelled"})]);
 assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
 assert.equal(results.filter(result=>result.status==="rejected").length,1);
 const restored=await resumeOddTask(contract(root),first,firstContext);assert.equal(restored?.taskEvents.length,2);
 assert.deepEqual(restored?.taskEvents.map(event=>event.revision),[1,2]);
});

test("a fresh contract cannot replace the saved history of the same ODD task candidate",async t=>{
 let store:SqliteMemoryStore|undefined;const root=await fixture(t,()=>store?.close());store=new SqliteMemoryStore(join(root,"memory.db"));const context=createMemoryContext(store,{repository:root},"session");
 await trackOddTask(contract(root),context,"odd/tasks/task.md",progress);
 const event={taskId:"task",sessionId:"session",projectId:root,revision:1,state:"planned" as const,at:"2026-10-12T00:00:00Z"};await appendOddTaskEvent(contract(root),context,store,event);
 const before=store.exportProject(root).observations;
 await assert.rejects(trackOddTask(contract(root),context,"odd/tasks/task.md",{...progress,nextStep:"Replace old plan"}),/already exists|resume/);
 assert.deepEqual(store.exportProject(root).observations,before);
 assert.equal((await resumeOddTask(contract(root),store,context))?.taskEvents.length,1);
});

test("concurrent first ODD mirrors create exactly one durable task record",async t=>{
 let store:SqliteMemoryStore|undefined;const root=await fixture(t,()=>store?.close());store=new SqliteMemoryStore(join(root,"memory.db"));const context=createMemoryContext(store,{repository:root},"session");
 const results=await Promise.allSettled([trackOddTask(contract(root),context,"odd/tasks/task.md",progress),trackOddTask(contract(root),context,"odd/tasks/task.md",{...progress,nextStep:"Competing plan"})]);
 assert.equal(results.filter(result=>result.status==="fulfilled").length,1);assert.equal(results.filter(result=>result.status==="rejected").length,1);
 assert.equal(store.exportProject(root).observations.length,1);assert.ok(await resumeOddTask(contract(root),store,context));
});

test("ODD resume rejects a task record updated during asynchronous document validation",async t=>{
 let store:SqliteMemoryStore|undefined;const root=await fixture(t,()=>store?.close());store=new SqliteMemoryStore(join(root,"memory.db"));const context=createMemoryContext(store,{repository:root},"session");
 await trackOddTask(contract(root),context,"odd/tasks/task.md",progress);let reads=0;
 const observed={get(id:string){const snapshot=store!.get(id);if(snapshot&&++reads===1){const payload=JSON.parse(snapshot.content);payload.nextStep="A newer saved step";context.rememberIfUnchanged(snapshot,{id:snapshot.id,kind:snapshot.kind,...(snapshot.topic!==undefined?{topic:snapshot.topic}:{}),content:JSON.stringify(payload),createdAt:snapshot.createdAt});}return snapshot;}};
 await assert.rejects(resumeOddTask(contract(root),observed,context),/changed.*resume|stale/);
 assert.equal((await resumeOddTask(contract(root),store,context))?.nextStep,"A newer saved step");
});

test("ODD resume cannot return a task deleted while its document was being checked",async t=>{
 let store:SqliteMemoryStore|undefined;const root=await fixture(t,()=>store?.close());store=new SqliteMemoryStore(join(root,"memory.db"));const context=createMemoryContext(store,{repository:root},"session");
 await trackOddTask(contract(root),context,"odd/tasks/task.md",progress);let reads=0;
 const observed={get(id:string){const snapshot=store!.get(id);if(snapshot&&++reads===1)store!.deleteObservation(id,root,true);return snapshot;}};
 await assert.rejects(resumeOddTask(contract(root),observed,context),/changed during resume/);
 assert.equal(await resumeOddTask(contract(root),store,context),undefined);
});


test("ECO-07 concurrent losing writer recovers winning revision and resumes safely",async t=>{
 let first:SqliteMemoryStore|undefined,second:SqliteMemoryStore|undefined;
 const root=await fixture(t,()=>{first?.close();second?.close();}),db=join(root,"memory.db"),c=contract(root);
 first=new SqliteMemoryStore(db);
 const context1=createMemoryContext(first,{repository:root},"shared-session");
 await trackOddTask(c,context1,"odd/tasks/task.md",progress);
 const base={taskId:"task",sessionId:"shared-session",projectId:root,at:"2026-10-12T00:00:00Z"};
 await appendOddTaskEvent(c,context1,first,{...base,revision:1,state:"planned"});
 second=new SqliteMemoryStore(db);
 const context2=createMemoryContext(second,{repository:root},"shared-session");
 const attempts=await Promise.allSettled([
  appendOddTaskEvent(c,context1,first,{...base,revision:2,state:"running"}),
  appendOddTaskEvent(c,context2,second,{...base,revision:2,state:"cancelled"}),
 ]);
 assert.equal(attempts.filter(result=>result.status==="fulfilled").length,1);
 assert.equal(attempts.filter(result=>result.status==="rejected").length,1);
 const recovered=await resumeOddTask(c,second,context2);
 assert.ok(recovered);
 assert.equal(recovered.taskEvents.length,2);
 assert.equal(recovered.taskEvents[1]?.revision,2);
 if(recovered.taskEvents[1]?.state==="running"){
  await appendOddTaskEvent(c,context2,second,{...base,revision:3,state:"done",at:"2026-10-12T00:00:01Z"});
  assert.equal((await resumeOddTask(c,first,context1))?.taskEvents.at(-1)?.state,"done");
 }else{
  assert.equal(recovered.taskEvents[1]?.state,"cancelled");
  await assert.rejects(()=>appendOddTaskEvent(c,context2,second,{...base,revision:3,state:"running",at:"2026-10-12T00:00:01Z"}),/transition/);
 }
});

test("ECO-07 changed task document rejects append without altering saved history",async t=>{
 let store:SqliteMemoryStore|undefined;
 const root=await fixture(t,()=>store?.close());
 store=new SqliteMemoryStore(join(root,"memory.db"));
 const context=createMemoryContext(store,{repository:root},"session"),c=contract(root);
 await trackOddTask(c,context,"odd/tasks/task.md",progress);
 const before=store.exportProject(root).observations;
 await writeFile(join(root,"odd/tasks/task.md"),"# Updated task\n");
 await assert.rejects(()=>appendOddTaskEvent(c,context,store,{
  taskId:"task",sessionId:"session",projectId:root,revision:1,state:"planned",at:"2026-10-12T00:00:00Z"
 }),/document changed/);
 assert.deepEqual(store.exportProject(root).observations,before);
});


test("ECO-07 persists history after restart and stale replay rejection",async t=>{
 let store:SqliteMemoryStore|undefined;
 const root=await fixture(t,()=>store?.close()),db=join(root,"memory.db"),c=contract(root);
 store=new SqliteMemoryStore(db);
 const context=createMemoryContext(store,{repository:root},"session");
 await trackOddTask(c,context,"odd/tasks/task.md",progress);
 const base={taskId:"task",sessionId:"session",projectId:root,at:"2026-10-12T00:00:00Z"};
 await appendOddTaskEvent(c,context,store,{...base,revision:1,state:"planned"});
 await appendOddTaskEvent(c,context,store,{...base,revision:2,state:"running"});
 await assert.rejects(()=>appendOddTaskEvent(c,context,store!,{...base,revision:2,state:"cancelled"}),/revision conflict/);
 store.close();store=undefined;
 const reopened=store=new SqliteMemoryStore(db);
 const resumed=await resumeOddTask(c,reopened,createMemoryContext(reopened,{repository:root},"session"));
 assert.deepEqual(resumed?.taskEvents.map(event=>event.state),["planned","running"]);
});

test("ECO-07 rejects writes from unrelated session without mutation",async t=>{
 let store:SqliteMemoryStore|undefined;
 const root=await fixture(t,()=>store?.close()),c=contract(root);
 store=new SqliteMemoryStore(join(root,"memory.db"));
 const source=createMemoryContext(store,{repository:root},"source");
 await trackOddTask(c,source,"odd/tasks/task.md",progress);
 const before=store.exportProject(root).observations;
 const other=createMemoryContext(store,{repository:root},"other");
 await assert.rejects(()=>appendOddTaskEvent(c,other,store,{
  taskId:"task",sessionId:"other",projectId:root,revision:1,state:"planned",at:"2026-10-12T00:00:00Z"
 }),/session mismatch/);
 assert.deepEqual(store.exportProject(root).observations,before);
});

test("ECO-07 cancelled task remains terminal after reopening",async t=>{
 let store:SqliteMemoryStore|undefined;
 const root=await fixture(t,()=>store?.close()),db=join(root,"memory.db"),c=contract(root);
 store=new SqliteMemoryStore(db);
 const source=createMemoryContext(store,{repository:root},"session");
 await trackOddTask(c,source,"odd/tasks/task.md",progress);
 const base={taskId:"task",sessionId:"session",projectId:root,at:"2026-10-12T00:00:00Z"};
 await appendOddTaskEvent(c,source,store,{...base,revision:1,state:"planned"});
 await appendOddTaskEvent(c,source,store,{...base,revision:2,state:"cancelled"});
 store.close();store=undefined;
 const reopened=store=new SqliteMemoryStore(db),context=createMemoryContext(reopened,{repository:root},"session");
 await assert.rejects(()=>appendOddTaskEvent(c,context,reopened,{...base,revision:3,state:"running"}),/transition/);
 assert.deepEqual((await resumeOddTask(c,reopened,context))?.taskEvents.map(event=>event.state),["planned","cancelled"]);
});


test("ECO-07 finished task stays terminal across database restart",async t=>{
 let store:SqliteMemoryStore|undefined;
 const root=await fixture(t,()=>store?.close()),db=join(root,"memory.db"),c=contract(root);
 store=new SqliteMemoryStore(db);
 const context=createMemoryContext(store,{repository:root},"session");
 await trackOddTask(c,context,"odd/tasks/task.md",progress);
 const base={taskId:"task",sessionId:"session",projectId:root,at:"2026-10-12T00:00:00Z"};
 await appendOddTaskEvent(c,context,store,{...base,revision:1,state:"planned"});
 await appendOddTaskEvent(c,context,store,{...base,revision:2,state:"running"});
 await appendOddTaskEvent(c,context,store,{...base,revision:3,state:"done"});
 store.close();store=undefined;
 const reopened=store=new SqliteMemoryStore(db),recovered=createMemoryContext(reopened,{repository:root},"session");
 await assert.rejects(()=>appendOddTaskEvent(c,recovered,reopened,{...base,revision:4,state:"running"}),/transition/);
 assert.deepEqual((await resumeOddTask(c,reopened,recovered))?.taskEvents.map(event=>event.state),["planned","running","done"]);
});

test("ECO-07 rejects an event from another project without modifying task history",async t=>{
 let store:SqliteMemoryStore|undefined;
 const root=await fixture(t,()=>store?.close()),c=contract(root);
 store=new SqliteMemoryStore(join(root,"memory.db"));
 const context=createMemoryContext(store,{repository:root},"session");
 await trackOddTask(c,context,"odd/tasks/task.md",progress);
 const before=store.exportProject(root).observations;
 await assert.rejects(()=>appendOddTaskEvent(c,context,store,{
  taskId:"task",sessionId:"session",projectId:"other-project",revision:1,state:"planned",at:"2026-10-12T00:00:00Z"
 }),/project identity/);
 assert.deepEqual(store.exportProject(root).observations,before);
});

test("ECO-07 rejects backwards timestamps without losing committed revisions",async t=>{
 let store:SqliteMemoryStore|undefined;
 const root=await fixture(t,()=>store?.close()),c=contract(root);
 store=new SqliteMemoryStore(join(root,"memory.db"));
 const context=createMemoryContext(store,{repository:root},"session");
 await trackOddTask(c,context,"odd/tasks/task.md",progress);
 const base={taskId:"task",sessionId:"session",projectId:root};
 await appendOddTaskEvent(c,context,store,{...base,revision:1,state:"planned",at:"2026-10-12T00:00:02Z"});
 await assert.rejects(()=>appendOddTaskEvent(c,context,store,{...base,revision:2,state:"running",at:"2026-10-12T00:00:01Z"}),/Stale task event/);
 assert.deepEqual((await resumeOddTask(c,store,context))?.taskEvents.map(event=>event.revision),[1]);
 await appendOddTaskEvent(c,context,store,{...base,revision:2,state:"running",at:"2026-10-12T00:00:03Z"});
 assert.deepEqual((await resumeOddTask(c,store,context))?.taskEvents.map(event=>event.revision),[1,2]);
});
