import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {dispatchNextPlanTask} from "../src/runtime/plan-dispatcher.js";
import {selectSkills} from "../src/skills/registry.js";

for(const [role,phase] of [["explorer","explore"],["reviewer","adversarial-review"],["verifier","verify"]] as const){
 test(`EF-103 stale candidate blocks ${role} before confirmation, launch and Todo mutation`,async t=>{
  const dir=await mkdtemp(join(tmpdir(),`asen-candidate-${role}-`));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const identity={sessionId:`f1-session-${role}`,projectId:await realpath(process.cwd())};
  const todos=await SessionTodoStore.open(join(dir,"todos.json"));
  const links=new TaskAgentLinkStore(join(dir,"links.json"));
  let launches=0,confirmations=0;
  const agents=await AgentRuntime.open({storeFile:join(dir,"agents.json"),runner:{run:async request=>{
   launches++;return{id:request.id,ok:true,output:"MUST NOT RUN"};
  }}});
  const selection={phase,risk:"low" as const,codeChange:false,behaviorChange:false,filesTouched:0};
  const [task]=await todos.addPlan([{title:`Candidate-bound ${role}`,
   requestId:`asen-plan:stale-${role}`,dependsOn:[],
   description:`Inspect candidate with ${role} without changing project files`,
   plan:{role,skillPaths:selectSkills(selection).map(skill=>skill.path),
    skillSelection:selection,candidateRevision:"0".repeat(40),priority:1},
  }],identity);
  assert.ok(task);
  const result=await dispatchNextPlanTask({todos,agents,links,identity,
   validateIdentity:async()=>{},confirm:async()=>{confirmations++;return true;}});
  assert.equal(result.status,"blocked");
  if(result.status==="blocked")assert.match(result.reason,/candidate|project changed/i);
  assert.equal((await todos.list(identity)).find(item=>item.taskId===task!.taskId)?.current.state,"planned");
  assert.equal(confirmations,0,"stale candidate cannot solicit approval for invalid scope");
  assert.equal(launches,0);
  assert.deepEqual(await links.list(identity),[]);
  assert.deepEqual(await agents.list(identity),[]);
 });
}
