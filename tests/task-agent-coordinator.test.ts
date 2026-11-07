import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {TaskAgentCoordinator} from "../src/runtime/task-agent-coordinator.js";

const recoveryIdentity={sessionId:"session",projectId:"/project"};
const recoveryAgent=(state="interrupted",role="explorer",id="attempt")=>({
 id,role,state,...recoveryIdentity,
});
const recoveryLink=(agentId="attempt")=>({taskId:"task",agentId,...recoveryIdentity,createdAt:"2026-01-01T00:00:00.000Z"});
const recoveryCases=[
 {name:"running work",agents:[recoveryAgent("running")],status:"active",nextAction:"observe"},
 {name:"queued work",agents:[recoveryAgent("queued")],status:"active",nextAction:"observe"},
 {name:"interrupted Explorer",agents:[recoveryAgent()],status:"manual-continuation",nextAction:"request-explicit-continuation"},
 {name:"failed Explorer",agents:[recoveryAgent("failed")],status:"fresh-confirmation",nextAction:"request-fresh-read-only-confirmation"},
 {name:"failed Reviewer",agents:[recoveryAgent("failed","reviewer")],role:"reviewer",status:"fresh-confirmation",nextAction:"request-fresh-read-only-confirmation"},
 {name:"failed Verifier",agents:[recoveryAgent("failed","verifier")],role:"verifier",status:"fresh-confirmation",nextAction:"request-fresh-read-only-confirmation"},
 {name:"interrupted Worker",agents:[recoveryAgent("interrupted","worker")],role:"worker",status:"manual-worker-reconciliation",nextAction:"reconcile-worker-manually"},
 {name:"failed Worker",agents:[recoveryAgent("failed","worker")],role:"worker",status:"manual-worker-reconciliation",nextAction:"reconcile-worker-manually"},
 {name:"completed Worker still needs inspection",agents:[recoveryAgent("completed","worker")],role:"worker",status:"inspect-result",nextAction:"inspect-result-and-acceptance"},
 {name:"completed Explorer",agents:[recoveryAgent("completed")],status:"inspect-result",nextAction:"inspect-result-and-acceptance"},
 {name:"cancelled result",agents:[recoveryAgent("cancelled")],status:"inspect-result",nextAction:"inspect-result-and-acceptance"},
 {name:"missing linked agent",agents:[],status:"reconciliation",nextAction:"reconcile-linked-evidence"},
 {name:"absent predecessor",agents:[recoveryAgent()],links:[recoveryLink("previous"),recoveryLink()],status:"reconciliation",nextAction:"reconcile-linked-evidence"},
 {name:"live predecessor",agents:[recoveryAgent("running","explorer","previous"),recoveryAgent()],links:[recoveryLink("previous"),recoveryLink()],status:"reconciliation",nextAction:"reconcile-linked-evidence"},
 {name:"interrupted predecessor with active latest",agents:[recoveryAgent("interrupted","explorer","previous"),recoveryAgent("running")],links:[recoveryLink("previous"),recoveryLink()],status:"active",nextAction:"observe"},
 {name:"foreign agent",agents:[{...recoveryAgent(),sessionId:"foreign"}],status:"reconciliation",nextAction:"reconcile-linked-evidence"},
 {name:"foreign project",agents:[{...recoveryAgent(),projectId:"/foreign"}],status:"reconciliation",nextAction:"reconcile-linked-evidence"},
 {name:"role mismatch",agents:[recoveryAgent("interrupted","worker")],status:"reconciliation",nextAction:"reconcile-linked-evidence"},
 {name:"unknown role",agents:[recoveryAgent("interrupted","unknown")],role:"unknown",status:"reconciliation",nextAction:"reconcile-linked-evidence"},
 {name:"malformed agent identity",agents:[{...recoveryAgent(),sessionId:""}],status:"reconciliation",nextAction:"reconcile-linked-evidence"},
 {name:"unknown agent state",agents:[recoveryAgent("mystery")],status:"reconciliation",nextAction:"reconcile-linked-evidence"},
 {name:"duplicate agent identity",agents:[recoveryAgent(),recoveryAgent()],status:"reconciliation",nextAction:"reconcile-linked-evidence"},
 {name:"no link despite task hint",agents:[recoveryAgent()],links:[],status:"unknown",nextAction:"inspect-task-and-links"},
 {name:"foreign link",agents:[recoveryAgent()],links:[{...recoveryLink(),sessionId:"foreign"}],status:"unknown",nextAction:"inspect-task-and-links"},
 {name:"foreign task identity",agents:[recoveryAgent()],taskSession:"foreign",status:"unknown",nextAction:"inspect-task-and-links"},
 {name:"missing task identity",agents:[recoveryAgent()],taskSession:"",status:"unknown",nextAction:"inspect-task-and-links"},
 {name:"uncertain planned dispatch",agents:[recoveryAgent("queued")],taskState:"planned",status:"reconciliation",nextAction:"reconcile-linked-evidence"},
 {name:"uncertain planned Worker",agents:[recoveryAgent("queued","worker")],role:"worker",taskState:"planned",status:"manual-worker-reconciliation",nextAction:"reconcile-worker-manually"},
 {name:"terminal task with live agent",agents:[recoveryAgent("running")],taskState:"done",status:"reconciliation",nextAction:"reconcile-linked-evidence"},
 {name:"successful Worker task is not acceptance",agents:[recoveryAgent("completed","worker")],role:"worker",taskState:"succeeded",status:"inspect-result",nextAction:"inspect-result-and-acceptance"},
 {name:"interrupted Reviewer has no continuation inference",agents:[recoveryAgent("interrupted","reviewer")],role:"reviewer",status:"unknown",nextAction:"inspect-task-and-links"},
 {name:"failed predecessor lacks observable consent",agents:[recoveryAgent("failed","explorer","previous"),recoveryAgent("completed")],links:[recoveryLink("previous"),recoveryLink()],status:"reconciliation",nextAction:"reconcile-linked-evidence"},
 {name:"duplicate journal binding",agents:[recoveryAgent()],links:[recoveryLink(),recoveryLink()],status:"reconciliation",nextAction:"reconcile-linked-evidence"},
];
for(const scenario of recoveryCases)test(`recovery disposition: ${scenario.name}`,async()=>{
 const task={taskId:"task",title:"Recover",current:{taskId:"task",...recoveryIdentity,sessionId:scenario.taskSession??recoveryIdentity.sessionId,state:scenario.taskState??"blocked",revision:2},plan:{role:scenario.role??"explorer"}};
 const links=scenario.links??[recoveryLink()],agents=scenario.agents;
 const before=structuredClone({task,links,agents});let reads=0;
 const coordinator=new TaskAgentCoordinator(
  {list:async()=>{reads++;return [task];},history:async()=>[]} as never,
  {list:async()=>{reads++;return agents;}} as never,
  {list:async()=>{reads++;return links;}} as never,
 );
 const row=(await coordinator.snapshot(recoveryIdentity)).tasks[0]!;
 const {recoveryDisposition,...prior}=row as typeof row & {recoveryDisposition:unknown};
 assert.deepEqual(recoveryDisposition,{
  advisory:true,automaticDispatch:false,grantsAuthority:false,status:scenario.status,nextAction:scenario.nextAction,
 });
 const matchingLinks=links.filter(link=>link.sessionId===recoveryIdentity.sessionId&&link.projectId===recoveryIdentity.projectId);
 assert.deepEqual(prior,{
  id:"task",title:"Recover",state:task.current.state,revision:2,dependsOn:[],blockedBy:[],
  linkedAttempts:matchingLinks.length,latestLinkedAgentId:matchingLinks.at(-1)?.agentId??null,
  launchRequiresReconciliation:task.current.state==="planned"&&matchingLinks.length>0,equivalentRunningExplorerId:null,ready:false,
  agents:agents.filter(agent=>agent.sessionId===recoveryIdentity.sessionId&&agent.projectId===recoveryIdentity.projectId&&matchingLinks.some(link=>link.agentId===agent.id)).map(({id,role,state})=>({id,role,state})),
 });
 assert.deepEqual({task,links,agents},before);
 assert.equal(reads,3,"only list reads; fake stores expose no launch or grant operations");
});

test("ECO-07 projection cannot complete tasks or expose another session",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-coordination-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const todos=await SessionTodoStore.open(join(dir,"todos.json"));
 const own={sessionId:"s1",projectId:"/project"},other={sessionId:"s2",projectId:"/project"};
 const item=await todos.add("Review plan",own);
 const foreign=await todos.add("Foreign plan",other);
 const agents={list:async(identity:{sessionId:string;projectId:string})=>identity.sessionId==="s1"?[
  {id:item.taskId+":explorer",role:"explorer",state:"completed",sessionId:"s1",projectId:"/project"},
  {id:item.taskId+":worker",role:"worker",state:"running",sessionId:"s2",projectId:"/project"},
  {id:item.taskId+":reviewer",role:"worker",state:"completed",sessionId:"s1",projectId:"/project"},
  {id:item.taskId+":explorer:spoof",role:"explorer",state:"completed",sessionId:"s1",projectId:"/project"},
 ]:[],query:async()=>null};
 const coordinator=new TaskAgentCoordinator(todos,agents as never);
 const snapshot=await coordinator.snapshot(own);
 assert.equal(snapshot.tasks.length,1);
 assert.equal(snapshot.tasks[0]?.state,"planned");
 assert.deepEqual(snapshot.tasks[0]?.agents.map(a=>a.id),[item.taskId+":explorer"]);
 assert.equal((await coordinator.snapshot(other)).tasks[0]?.id,foreign.taskId);
 assert.equal(await coordinator.task(item.taskId,other),null);
 assert.equal((await coordinator.task(item.taskId,own))?.history.length,1);
 assert.equal((await todos.history(item.taskId,own)).at(-1)?.state,"planned");
});
test("ECO-07 read-only projection preserves blocked tasks across restart",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-coordination-restart-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,"todos.json"),own={sessionId:"session",projectId:"/project"};
 const first=await SessionTodoStore.open(path),item=await first.add("Resume safely",own);
 await first.update(item.taskId,own,1,"running");
 const restarted=await SessionTodoStore.open(path);await restarted.recover(own);
 const coordinator=new TaskAgentCoordinator(restarted,{list:async()=>[]} as never);
 const view=await coordinator.task(item.taskId,own);
 assert.equal(view?.state,"blocked");
 assert.deepEqual(view?.agents,[]);
 assert.equal(view?.history.at(-1)?.state,"blocked");
 assert.equal((await coordinator.snapshot(own)).tasks[0]?.state,"blocked");
});

test("EF-103 coordination projection preserves missing dependencies as blocking evidence",async()=>{
 const identity={sessionId:"session",projectId:"/project"};
 const task={taskId:"todo-dependent",title:"Verifier must not run before prerequisite",current:{state:"planned",revision:1},dependsOn:["todo-prerequisite"],requestId:"asen-plan:verification"};
 const todos={list:async()=>[task],history:async()=>[]};
 const coordinator=new TaskAgentCoordinator(todos as never,{list:async()=>[]} as never);
 const projection=await coordinator.snapshot(identity);
 assert.deepEqual(projection.tasks[0]?.dependsOn,["todo-prerequisite"]);
 assert.deepEqual(projection.tasks[0]?.blockedBy,[{id:"todo-prerequisite",state:"missing"}]);
 assert.equal(projection.tasks[0]?.ready,false);
 assert.equal(projection.tasks[0]?.state,"planned");
});
test("EF-103 a running, blocked or cancelled dependency is never projected as ready",async()=>{
 const identity={sessionId:"session",projectId:"/project"};
 for(const state of ["planned","running","blocked","cancelled","failed"]){
  const rows=[
   {taskId:"dependency",title:"Prerequisite",current:{state,revision:2}},
   {taskId:"dependent",title:"Dependent",dependsOn:["dependency"],current:{state:"planned",revision:1}},
  ];
  const coordinator=new TaskAgentCoordinator({list:async()=>rows} as never,{list:async()=>[]} as never);
  const row=(await coordinator.snapshot(identity)).tasks.find(item=>item.id==="dependent");
  assert.deepEqual(row?.blockedBy,[{id:"dependency",state}]);
  assert.equal(row?.ready,false);
 }
});
