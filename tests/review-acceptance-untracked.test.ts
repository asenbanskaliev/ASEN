// T5.3: when review acceptance is blocked by an unclean worktree, the error
// must name exactly which files are dirty — not a generic "clean worktree"
// message that forces the user to run `git status` by hand.
//
// RED (before the fix): the message was "Review acceptance requires a clean
// worktree and index" with no file list.
import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp,mkdir,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {acceptIndependentReview} from "../src/runtime/review-acceptance.js";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {TaskAgentTodoReconciler} from "../src/runtime/task-agent-reconciler.js";
import {selectSkills,type SkillSelectionContext} from "../src/skills/registry.js";

const passing=JSON.stringify({verdict:"pass",evidence:["Test passed on the scoped candidate"]});

async function makeFixture(t:import("node:test").TestContext){
 const home=await mkdtemp(join(tmpdir(),"asen-review-untracked-"));
 t.after(()=>rm(home,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 const root=join(home,"repo");await mkdir(root);await writeFile(join(root,"README.md"),"base\n");
 execFileSync("git",["init","-q",root]);
 execFileSync("git",["-C",root,"add","README.md"]);
 execFileSync("git",["-C",root,"-c","user.name=AsenTest","-c","user.email=test@example.invalid","commit","-q","-m","base"]);
 const candidateRevision=execFileSync("git",["-C",root,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const identity={sessionId:"review-session",projectId:root},todos=await SessionTodoStore.open(join(home,"todos.json"));
 const links=new TaskAgentLinkStore(join(home,"links.json"));
 const role="reviewer" as const;
 const selection:SkillSelectionContext={phase:"adversarial-review",risk:"low",codeChange:false,behaviorChange:false,filesTouched:0};
 const [task]=await todos.addPlan([{requestId:"asen-plan:review-reviewer",title:"Independent review",
  dependsOn:[],description:"Check only the exact frozen candidate",
  plan:{role,priority:1,skillSelection:selection,skillPaths:selectSkills(selection).map(x=>x.path),candidateRevision}}],identity);
 assert.ok(task);
 await todos.update(task!.taskId,identity,1,"running");
 const agents=await AgentRuntime.open({storeFile:join(home,"agents.json"),runner:{
  run:async request=>({id:request.id,ok:true,output:passing}),
 }});
 let done!:()=>void;const terminal=new Promise<void>(resolve=>{done=resolve;});
 const unsubscribe=agents.subscribeTerminal(record=>{if(record.state==="completed")done();});t.after(unsubscribe);
 const agentId=await agents.startReadOnly({role,prompt:"Independently verify",session:identity,skillSelection:selection});
 await links.bind({taskId:task!.taskId,agentId,sessionId:identity.sessionId,projectId:identity.projectId,createdAt:new Date().toISOString()});
 await terminal;
 await new TaskAgentTodoReconciler(todos,agents,links).reconcile(identity);
 return {home,root,identity,todos,links,agents,task:task!};
}

test("T5.3 a dirty worktree names the offending files",async t=>{
 const fixture=await makeFixture(t);
 // Dirty the worktree after the review was built.
 await writeFile(join(fixture.root,"dirty.txt"),"not committed\n");
 await writeFile(join(fixture.root,"README.md"),"changed\n");
 const result=await acceptIndependentReview({
  todos:fixture.todos,agents:fixture.agents,links:fixture.links,identity:fixture.identity,
  taskId:fixture.task.taskId,
  validateIdentity:async()=>{},
  confirm:async()=>true,
 });
 assert.equal(result.status,"blocked");
 assert.match((result as {reason:string}).reason,/dirty\.txt/,`the untracked file must be named: ${(result as {reason:string}).reason}`);
 assert.match((result as {reason:string}).reason,/README\.md/,`the modified file must be named: ${(result as {reason:string}).reason}`);
});

test("T5.3 a clean worktree keeps the review acceptable",async t=>{
 const fixture=await makeFixture(t);
 const result=await acceptIndependentReview({
  todos:fixture.todos,agents:fixture.agents,links:fixture.links,identity:fixture.identity,
  taskId:fixture.task.taskId,
  validateIdentity:async()=>{},
  confirm:async()=>true,
 });
 assert.deepEqual(result,{status:"accepted",taskId:fixture.task.taskId,role:"reviewer"});
});
