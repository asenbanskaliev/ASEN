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
 assert.equal((await todos.list(identity)).find(row=>row.taskId===explorer.taskId)?.current.state,"succeeded");
 await todos.update(verifier.taskId,identity,1,"running");
 await links.bind({taskId:verifier.taskId,agentId:"task:verifier",...identity,createdAt:"2026-10-14T00:00:02.000Z"});
 records=[...records,{id:"task:verifier",role:"verifier",owner:{kind:"user",id:"user"},state:"completed",createdAt:"2026-10-14T00:00:02.000Z",updatedAt:"2026-10-14T00:00:03.000Z",summary:JSON.stringify({verdict:"pass",evidence:["Reviewed the final diff","Required local checks passed"]}),...identity}];
 await reconciler.reconcile(identity);
 assert.equal((await todos.list(identity)).find(row=>row.taskId===verifier.taskId)?.current.state,"done");
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
