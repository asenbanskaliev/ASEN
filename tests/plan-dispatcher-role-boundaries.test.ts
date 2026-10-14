import assert from "node:assert/strict";
import {mkdtemp,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test,{type TestContext} from "node:test";
import type {AgentRequest} from "../src/agents/dispatcher.js";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {dispatchNextPlanTask} from "../src/runtime/plan-dispatcher.js";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
import {TaskAgentTodoReconciler} from "../src/runtime/task-agent-reconciler.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";

async function clarifierFixture(t:TestContext,instruction="Clarify every persisted ambiguity before any implementation starts",control?:{entered:()=>void;complete:Promise<void>}){
 const home=await mkdtemp(join(tmpdir(),"asen-clarifier-dispatch-"));t.after(()=>rm(home,{recursive:true,force:true}));
 const identity={sessionId:"eco06-clarifier",projectId:await realpath(process.cwd())};
 const todos=await SessionTodoStore.open(join(home,"todos.json"));
 const links=new TaskAgentLinkStore(join(home,"links.json"));
 const task=(await todos.addPlan([{title:"Clarify the request",requestId:"asen-plan:eco06:clarifier",dependsOn:[],description:instruction,plan:{role:"clarifier",priority:1,skillPaths:[]}}],identity))[0]!;
 const seen:AgentRequest[]=[];
 const agents=await AgentRuntime.open({storeFile:join(home,"agents.json"),runner:{run:async request=>{
  const rows=await todos.list(identity),savedLinks=await links.list(identity);
  assert.equal(rows.find(row=>row.taskId===task.taskId)?.current.state,"running","Todo claim must precede runner start");
  assert.equal(savedLinks.find(link=>link.agentId===request.id)?.taskId,task.taskId,"durable link must precede runner start");
  seen.push(request);control?.entered();if(control)await control.complete;
  return{id:request.id,ok:true,output:"Clarification result requires explicit acceptance"};
 }}});
 return {identity,todos,links,task,seen,agents};
}

test("approved clarifier dispatches once with exact read-only provenance and remains blocked for acceptance",async t=>{
 const instruction=`Clarify the complete persisted request: ${"detail ".repeat(80)}`.trim();
 const fixture=await clarifierFixture(t,instruction);let confirmations=0,shown="",signalTerminal!:()=>void;
 const terminal=new Promise<void>(resolve=>{signalTerminal=resolve;}),unsubscribe=fixture.agents.subscribeTerminal(record=>{if(record.state==="completed")signalTerminal();});t.after(unsubscribe);
 const result=await dispatchNextPlanTask({...fixture,validateIdentity:async()=>{},confirm:async task=>{confirmations++;shown=task.instruction;return true;}});
 assert.equal(result.status,"dispatched");if(result.status!=="dispatched")return;
 assert.equal(result.role,"clarifier");assert.equal(confirmations,1);assert.equal(shown,instruction);
 await terminal;
 await new TaskAgentTodoReconciler(fixture.todos,fixture.agents,fixture.links).reconcile(fixture.identity);
 assert.equal(fixture.seen.length,1);const request=fixture.seen[0]!;
 assert.equal(request.role,"clarifier");assert.equal(request.prompt,instruction);
 for(const field of ["candidate","writeSurfaces","phaseGrant","writerAdmission","runnerWriteReceiver"] as const)assert.equal(request[field],undefined,`${field} must not reach a clarifier`);
 assert.equal((await fixture.todos.list(fixture.identity))[0]?.current.state,"blocked");
 const persisted=await fixture.agents.store.get(result.agentId,fixture.identity.sessionId,fixture.identity.projectId);
 assert.equal(persisted?.request.role,"clarifier");assert.equal(persisted?.request.prompt,instruction);
});

test("declined clarifier stays planned and launches nothing",async t=>{
 const fixture=await clarifierFixture(t);let confirmations=0;
 const result=await dispatchNextPlanTask({...fixture,validateIdentity:async()=>{},confirm:async()=>{confirmations++;return false;}});
 assert.equal(result.status,"blocked");assert.equal(confirmations,1);assert.equal(fixture.seen.length,0);
 assert.equal((await fixture.todos.list(fixture.identity))[0]?.current.state,"planned");
 assert.deepEqual(await fixture.agents.list(fixture.identity),[]);assert.deepEqual(await fixture.links.list(fixture.identity),[]);
});

test("clarifier identity drift after approval launches nothing and stays planned",async t=>{
 const fixture=await clarifierFixture(t);
 await assert.rejects(()=>dispatchNextPlanTask({...fixture,validateIdentity:async()=>{throw new Error("session identity changed");},confirm:async()=>true}),/identity changed/u);
 assert.equal((await fixture.todos.list(fixture.identity))[0]?.current.state,"planned");
 assert.deepEqual(await fixture.agents.list(fixture.identity),[]);assert.deepEqual(await fixture.links.list(fixture.identity),[]);
});

test("clarifier revision drift after approval launches nothing and stays planned",async t=>{
 const fixture=await clarifierFixture(t);let reads=0;
 const todos={list:async(identity:typeof fixture.identity)=>{const rows=await fixture.todos.list(identity);reads++;return reads===1?rows:rows.map(row=>row.taskId===fixture.task.taskId?{...row,current:{...row.current,revision:row.current.revision+1}}:row);},withAgentLaunch:fixture.todos.withAgentLaunch.bind(fixture.todos)};
 const result=await dispatchNextPlanTask({...fixture,todos:todos as typeof fixture.todos,validateIdentity:async()=>{},confirm:async()=>true});
 assert.equal(result.status,"blocked");if(result.status==="blocked")assert.match(result.reason,/changed while awaiting confirmation/u);
 assert.equal((await fixture.todos.list(fixture.identity))[0]?.current.state,"planned");
 assert.deepEqual(await fixture.agents.list(fixture.identity),[]);assert.deepEqual(await fixture.links.list(fixture.identity),[]);
});

test("concurrent clarifier dispatch admits exactly one durable agent",async t=>{
 let signalEntry!:()=>void,finishRunner!:()=>void;
 const runnerEntered=new Promise<void>(resolve=>{signalEntry=resolve;}),allowCompletion=new Promise<void>(resolve=>{finishRunner=resolve;});
 const fixture=await clarifierFixture(t,undefined,{entered:signalEntry,complete:allowCompletion});let confirmations=0,releaseConfirm!:()=>void;
 const bothConfirmed=new Promise<void>(resolve=>{releaseConfirm=resolve;});
 const confirm=async()=>{confirmations++;if(confirmations===2)releaseConfirm();await bothConfirmed;return true;};
 let signalTerminal!:()=>void;const terminal=new Promise<void>(resolve=>{signalTerminal=resolve;}),unsubscribe=fixture.agents.subscribeTerminal(record=>{if(record.state==="completed")signalTerminal();});t.after(unsubscribe);
 const results=await Promise.allSettled([dispatchNextPlanTask({...fixture,validateIdentity:async()=>{},confirm}),dispatchNextPlanTask({...fixture,validateIdentity:async()=>{},confirm})]);
 assert.ok(results.every(result=>result.status==="fulfilled"),"both dispatch calls must return safe results");
 const outcomes=results.map(result=>(result as PromiseFulfilledResult<Awaited<ReturnType<typeof dispatchNextPlanTask>>>).value);
 const winners=outcomes.filter(outcome=>outcome.status==="dispatched"),losers=outcomes.filter(outcome=>outcome.status==="blocked");
 assert.equal(winners.length,1);assert.equal(losers.length,1);assert.deepEqual(losers[0],{status:"blocked",reason:"The plan task changed while awaiting confirmation; refresh the plan before dispatch."});
 await runnerEntered;
 let agents=await fixture.agents.list(fixture.identity);const links=await fixture.links.list(fixture.identity);
 assert.equal(agents.length,1,"the losing dispatch must not persist an agent");assert.equal(links.length,1);assert.equal(fixture.seen.length,1);assert.equal(agents[0]?.state,"running");
 finishRunner();await terminal;await new TaskAgentTodoReconciler(fixture.todos,fixture.agents,fixture.links).reconcile(fixture.identity);
 agents=await fixture.agents.list(fixture.identity);assert.equal(agents.length,1);assert.equal(agents[0]?.state,"completed");assert.equal(agents.some(agent=>agent.state==="queued"||agent.state==="running"),false);
 assert.equal((await fixture.todos.list(fixture.identity))[0]?.current.state,"blocked");
});

test("confirmed clarifier snapshot rejects instruction, plan, and dependency drift before enqueue",async t=>{
 for(const mutation of ["description","plan","dependencies"] as const){
  await t.test(mutation,async child=>{
   const fixture=await clarifierFixture(child);let reads=0;
   const todos={list:async(identity:typeof fixture.identity)=>{const rows=await fixture.todos.list(identity);if(++reads<=2)return rows;return rows.map(row=>{
    if(row.taskId!==fixture.task.taskId)return row;
    if(mutation==="description")return {...row,description:"Different instruction after confirmation"};
    if(mutation==="plan")return {...row,plan:{...row.plan!,priority:2}};
    return {...row,dependsOn:["todo-substituted-dependency"]};
   });},withAgentLaunch:fixture.todos.withAgentLaunch.bind(fixture.todos)};
   const result=await dispatchNextPlanTask({...fixture,todos:todos as typeof fixture.todos,validateIdentity:async()=>{},confirm:async()=>true});
   assert.equal(result.status,"blocked");assert.equal((await fixture.todos.list(fixture.identity))[0]?.current.state,"planned");
   assert.deepEqual(await fixture.agents.list(fixture.identity),[]);assert.deepEqual(await fixture.links.list(fixture.identity),[]);assert.equal(fixture.seen.length,0);
  });
 }
});

test("oversized clarifier is rejected before confirmation and stays planned",async t=>{
 const fixture=await clarifierFixture(t,"c".repeat(4097));let confirmations=0;
 const result=await dispatchNextPlanTask({...fixture,validateIdentity:async()=>{},confirm:async()=>{confirmations++;return true;}});
 assert.equal(result.status,"blocked");if(result.status==="blocked")assert.match(result.reason,/complete plan instruction exceeds/u);
 assert.equal(confirmations,0);assert.equal((await fixture.todos.list(fixture.identity))[0]?.current.state,"planned");
 assert.deepEqual(await fixture.agents.list(fixture.identity),[]);assert.deepEqual(await fixture.links.list(fixture.identity),[]);
});

test("primary remains blocked without confirmation or launch",async()=>{
 let confirmations=0,agentStarts=0;
 const input={todos:{list:async()=>[{taskId:"todo-primary",requestId:"asen-plan:primary",current:{state:"planned",revision:1},dependsOn:[],description:"Do not dispatch primary",plan:{role:"primary",priority:1,skillPaths:[]}}]},agents:{startReadOnly:async()=>{agentStarts++;return"unexpected";},startControlledWorker:async()=>{agentStarts++;return"unexpected";}},links:{},identity:{sessionId:"eco06-role-boundary",projectId:"/tmp/eco06-role-boundary"},validateIdentity:async()=>{},confirm:async()=>{confirmations++;return true;}} as unknown as Parameters<typeof dispatchNextPlanTask>[0];
 const result=await dispatchNextPlanTask(input);
 assert.equal(result.status,"blocked");if(result.status==="blocked")assert.match(result.reason,/controlled primary lifecycle dispatcher/u);
 assert.equal(confirmations,0);assert.equal(agentStarts,0);
});
