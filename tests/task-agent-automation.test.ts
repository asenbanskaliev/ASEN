import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
import {TaskAgentTodoReconciler} from "../src/runtime/task-agent-reconciler.js";
import {dispatchNextPlanTask} from "../src/runtime/plan-dispatcher.js";
import {selectSkills} from "../src/skills/registry.js";

test("automatic plan advancement skips confirmation only for the exact read-only role",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-plan-auto-read-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const identity={sessionId:"session-a",projectId:dir},todos=await SessionTodoStore.open(join(dir,"todos.json")),links=new TaskAgentLinkStore(join(dir,"links.json"));
 const explorerSelection={phase:"explore"} as const;
 const [task]=await todos.addPlan([{title:"Inspect project",requestId:"asen-plan:task:explorer",dependsOn:[],description:"Inspect the bounded project",plan:{role:"explorer",skillPaths:selectSkills(explorerSelection).map(skill=>skill.path),skillSelection:explorerSelection,priority:1}}],identity);
 const runtime=await AgentRuntime.open({storeFile:join(dir,"agents.json"),runner:{run:async(request:{id:string})=>({id:request.id,ok:true,output:"Read only findings"})} as never});let prompts=0;
 const result=await dispatchNextPlanTask({todos,agents:runtime,links,identity,autoApproveReadOnly:true,validateIdentity:async()=>{},confirm:async()=>{prompts++;return false;}});
 assert.equal(result.status,"dispatched");assert.equal(prompts,0);
 const record=(await runtime.list(identity))[0];assert.equal(record?.role,"explorer");assert.equal((await links.list(identity))[0]?.taskId,task?.taskId);
 const deadline=Date.now()+3000;let terminal;while(Date.now()<deadline){terminal=(await runtime.list(identity))[0];if(terminal?.state==="completed")break;await new Promise(resolve=>setTimeout(resolve,5));}assert.equal(terminal?.state,"completed");
});

test("automatic advancement stops at a clarification instead of inventing missing facts",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-plan-auto-clarify-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const identity={sessionId:"session-clarify",projectId:dir},todos=await SessionTodoStore.open(join(dir,"todos.json")),links=new TaskAgentLinkStore(join(dir,"links.json"));
 await todos.addPlan([{title:"Resolve uncertainty",requestId:"asen-plan:task:clarifier",dependsOn:[],description:"Ask the user about the unresolved choice",plan:{role:"clarifier",skillPaths:[],priority:1}}],identity);
 const runtime=await AgentRuntime.open({storeFile:join(dir,"agents.json"),runner:{run:async(request:{id:string})=>({id:request.id,ok:true,output:"Should not run"})} as never});
 const result=await dispatchNextPlanTask({todos,agents:runtime,links,identity,autoApproveReadOnly:true,validateIdentity:async()=>{},confirm:async()=>true});
 assert.equal(result.status,"blocked");if(result.status==="blocked")assert.match(result.reason,/clarification is required/u);
 assert.equal((await runtime.list(identity)).length,0);
});

test("successful DAG steps advance separately from independent final verification",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-plan-auto-verify-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const identity={sessionId:"session-b",projectId:dir},todos=await SessionTodoStore.open(join(dir,"todos.json")),links=new TaskAgentLinkStore(join(dir,"links.json"));
 const [explorer,verifier]=await todos.addPlan([
  {title:"Explore",requestId:"asen-plan:task:explorer",dependsOn:[],description:"Inspect",plan:{role:"explorer",skillPaths:selectSkills({phase:"explore"}).map(skill=>skill.path),skillSelection:{phase:"explore"},priority:1}},
  {title:"Verify",requestId:"asen-plan:task:verifier",dependsOn:["asen-plan:task:explorer"],description:"Verify independently",plan:{role:"verifier",skillPaths:selectSkills({phase:"verify"}).map(skill=>skill.path),skillSelection:{phase:"verify"},priority:4}},
 ],identity);
 assert.ok(explorer&&verifier);
 await todos.update(explorer.taskId,identity,1,"running");
 await links.bind({taskId:explorer.taskId,agentId:"task:explorer",...identity,createdAt:"2026-10-14T00:00:00.000Z"});
 let records=[{id:"task:explorer",role:"explorer",owner:{kind:"user" as const,id:"user"},state:"completed" as const,createdAt:"2026-10-14T00:00:00.000Z",updatedAt:"2026-10-14T00:00:01.000Z",summary:"Findings",...identity}];
 const runtime={list:async()=>records};
 const reconciler=new TaskAgentTodoReconciler(todos,runtime as never,links);
 await reconciler.reconcile(identity);
 assert.equal((await todos.list(identity)).find(row=>row.taskId===explorer.taskId)?.current.state,"done");
 await todos.update(verifier.taskId,identity,1,"running");
 await links.bind({taskId:verifier.taskId,agentId:"task:verifier",...identity,createdAt:"2026-10-14T00:00:02.000Z"});
 records=[...records,{id:"task:verifier",role:"verifier",owner:{kind:"user",id:"user"},state:"completed",createdAt:"2026-10-14T00:00:02.000Z",updatedAt:"2026-10-14T00:00:03.000Z",summary:JSON.stringify({verdict:"pass",evidence:["Reviewed the final diff","Required local checks passed"]}),...identity}];
 await reconciler.reconcile(identity);
 assert.equal((await todos.list(identity)).find(row=>row.taskId===verifier.taskId)?.current.state,"done");
});

test("a passing linked verifier closes its successful upstream writer without a second acceptance",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-plan-auto-close-writer-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const identity={sessionId:"session-writer-verify",projectId:dir},todos=await SessionTodoStore.open(join(dir,"todos.json")),links=new TaskAgentLinkStore(join(dir,"links.json")),selection={phase:"apply" as const,risk:"low" as const,codeChange:true,behaviorChange:false,filesTouched:1},candidate={id:"candidate-writer",repository:dir,revision:"a".repeat(40),createdAt:"2026-10-14T00:00:00.000Z"};
 const [worker,unrelatedWorker,verifier]=await todos.addPlan([
  {title:"Apply scoped change",requestId:"asen-plan:writer-verify:worker",dependsOn:[],description:"Update the approved file",plan:{role:"worker",skillPaths:selectSkills(selection).map(skill=>skill.path),skillSelection:selection,priority:2,candidate,writeSurfaces:["README.md"],writerAuthorizationBasis:JSON.stringify({authorization:"Explicit one-run Pi UI authorization"})}},
  {title:"Apply separate change",requestId:"asen-plan:other:worker",dependsOn:[],description:"Update a separate approved file",plan:{role:"worker",skillPaths:selectSkills(selection).map(skill=>skill.path),skillSelection:selection,priority:2,candidate:{...candidate,id:"candidate-other"},writeSurfaces:["docs/guide.md"],writerAuthorizationBasis:JSON.stringify({authorization:"Separate one-run Pi UI authorization"})}},
  {title:"Verify change",requestId:"asen-plan:writer-verify:verifier",dependsOn:["asen-plan:writer-verify:worker"],description:"Inspect the actual diff and run checks",plan:{role:"verifier",skillPaths:selectSkills({phase:"verify"}).map(skill=>skill.path),skillSelection:{phase:"verify"},priority:4}},
 ],identity);assert.ok(worker&&unrelatedWorker&&verifier);
 await todos.update(worker.taskId,identity,1,"running");await links.bind({taskId:worker.taskId,agentId:"task:worker",...identity,createdAt:"2026-10-14T00:00:00.000Z"});
 await todos.update(worker.taskId,identity,2,"succeeded","Worker ran within its authorized scope");
 await todos.update(unrelatedWorker.taskId,identity,1,"running");await links.bind({taskId:unrelatedWorker.taskId,agentId:"task:other-worker",...identity,createdAt:"2026-10-14T00:00:00.000Z"});
 await todos.update(unrelatedWorker.taskId,identity,2,"succeeded","Separate worker awaits its own verification");
 await todos.update(verifier.taskId,identity,1,"running");await links.bind({taskId:verifier.taskId,agentId:"task:verifier",...identity,createdAt:"2026-10-14T00:00:01.000Z"});
 const agents={list:async()=>[
  {id:"task:worker",role:"worker",owner:{kind:"user" as const,id:"user"},state:"completed" as const,createdAt:"2026-10-14T00:00:00.000Z",updatedAt:"2026-10-14T00:00:01.000Z",summary:"Changed only README.md",...identity},
  {id:"task:other-worker",role:"worker",owner:{kind:"user" as const,id:"user"},state:"completed" as const,createdAt:"2026-10-14T00:00:00.000Z",updatedAt:"2026-10-14T00:00:01.000Z",summary:"Changed only docs/guide.md",...identity},
  {id:"task:verifier",role:"verifier",owner:{kind:"user" as const,id:"user"},state:"completed" as const,createdAt:"2026-10-14T00:00:01.000Z",updatedAt:"2026-10-14T00:00:02.000Z",summary:JSON.stringify({verdict:"pass",evidence:["Only the authorized file changed","Local checks passed"]}),...identity},
 ]};
 await new TaskAgentTodoReconciler(todos,agents as never,links).reconcile(identity);
 const rows=await todos.list(identity);assert.equal(rows.find(row=>row.taskId===worker.taskId)?.current.state,"done");assert.match(rows.find(row=>row.taskId===worker.taskId)?.current.reason??"",/Independent verifier task:verifier/u);assert.equal(rows.find(row=>row.taskId===verifier.taskId)?.current.state,"done");assert.equal(rows.find(row=>row.taskId===unrelatedWorker.taskId)?.current.state,"succeeded","verification cannot close an unrelated writer from the same session");
});

test("verifier cannot finish a plan without a structured passing verdict",async t=>{
 for(const [name,summary] of [["free text","Looks good"],["failed verdict",JSON.stringify({verdict:"fail",evidence:["Tests failed"]})],["missing evidence",JSON.stringify({verdict:"pass",evidence:[]})]] as const){
  const dir=await mkdtemp(join(tmpdir(),`asen-plan-auto-reject-${name}-`));t.after(()=>rm(dir,{recursive:true,force:true}));
  const identity={sessionId:`session-${name.replaceAll(" ","-")}`,projectId:dir},todos=await SessionTodoStore.open(join(dir,"todos.json")),links=new TaskAgentLinkStore(join(dir,"links.json"));
  const verifierSelection={phase:"verify"} as const;
  const [task]=await todos.addPlan([{title:"Verify",requestId:"asen-plan:task:verifier",dependsOn:[],description:"Verify independently",plan:{role:"verifier",skillPaths:selectSkills(verifierSelection).map(skill=>skill.path),skillSelection:verifierSelection,priority:4}}],identity);
  await todos.update(task!.taskId,identity,1,"running");
  await links.bind({taskId:task!.taskId,agentId:"task:verifier",...identity,createdAt:"2026-10-14T00:00:00.000Z"});
  const agents={list:async()=>[{id:"task:verifier",role:"verifier",owner:{kind:"user" as const,id:"user"},state:"completed" as const,createdAt:"2026-10-14T00:00:00.000Z",updatedAt:"2026-10-14T00:00:01.000Z",summary,...identity}]};
  await new TaskAgentTodoReconciler(todos,agents as never,links).reconcile(identity);
  const current=(await todos.list(identity)).find(row=>row.taskId===task!.taskId)?.current;
  assert.equal(current?.state,"blocked",name);assert.match(current?.reason??"",/valid successful result/u,name);
 }
});
