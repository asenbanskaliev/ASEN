import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp,mkdir,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {TaskAgentTodoReconciler} from "../src/runtime/task-agent-reconciler.js";
import {acceptIndependentReview,parseReviewVerdict} from "../src/runtime/review-acceptance.js";
import {selectSkills,type SkillSelectionContext} from "../src/skills/registry.js";

const good=JSON.stringify({verdict:"pass",evidence:["Test passed on the scoped candidate","Reviewed the exact Git revision"]});
async function makeFixture(t:import("node:test").TestContext,role:"reviewer"|"verifier"="reviewer",
 output=good,options:{candidateRevision?:string;link?:boolean}={}){
 const home=await mkdtemp(join(tmpdir(),"asen-manual-review-"));
 t.after(()=>rm(home,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 const root=join(home,"repo");await mkdir(root);await writeFile(join(root,"README.md"),"base\n");
 execFileSync("git",["init","-q",root]);
 execFileSync("git",["-C",root,"add","README.md"]);
 execFileSync("git",["-C",root,"-c","user.name=AsenTest","-c","user.email=test@example.invalid","commit","-q","-m","base"]);
 const sha=execFileSync("git",["-C",root,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const identity={sessionId:"review-session",projectId:root},todos=await SessionTodoStore.open(join(home,"todos.json"));
 const links=new TaskAgentLinkStore(join(home,"links.json"));
 const phase=role==="reviewer"?"adversarial-review":"verify";
 const selection:SkillSelectionContext={phase,risk:"low",codeChange:false,behaviorChange:false,filesTouched:0};
 const [task]=await todos.addPlan([{requestId:`asen-plan:review-${role}`,title:"Independent review",
  dependsOn:[],description:"Check only the exact frozen candidate",
  plan:{role,priority:1,skillSelection:selection,skillPaths:selectSkills(selection).map(x=>x.path),
   candidateRevision:options.candidateRevision??sha}}],identity);
 assert.ok(task);
 await todos.update(task!.taskId,identity,1,"running");
 const agents=await AgentRuntime.open({storeFile:join(home,"agents.json"),runner:{
  run:async request=>({id:request.id,ok:true,output}),
 }});
 let done!:()=>void;const terminal=new Promise<void>(resolve=>{done=resolve;});
 const unsubscribe=agents.subscribeTerminal(record=>{if(record.state==="completed")done();});t.after(unsubscribe);
 const id=await agents.startReadOnly({role,prompt:"Independently verify",session:identity,skillSelection:selection});
 if(options.link!==false)await links.bind({taskId:task!.taskId,agentId:id,sessionId:identity.sessionId,projectId:identity.projectId,createdAt:new Date().toISOString()});
 await terminal;
 if(options.link!==false)await new TaskAgentTodoReconciler(todos,agents,links).reconcile(identity);
 return{home,root,sha,identity,todos,links,agents,task:task!,agentId:id};
}
test("EF-502 strict evidence parser requires pass/fail, bounded findings and no hidden controls",()=>{
 assert.deepEqual(parseReviewVerdict(good),{verdict:"pass",evidence:["Test passed on the scoped candidate","Reviewed the exact Git revision"]});
 assert.equal(parseReviewVerdict(JSON.stringify({verdict:"fail",evidence:["Found a defect"]}))?.verdict,"fail");
 assert.deepEqual(parseReviewVerdict('{\n  "verdict": "pass",\n  "evidence": ["ok"]\n}'),{verdict:"pass",evidence:["ok"]});
 for(const raw of [
  "RESULT: "+good,"\x1b[31m"+good,JSON.stringify({verdict:"pass",evidence:[]}),
  JSON.stringify({verdict:"pass",evidence:[""]}),JSON.stringify({verdict:"pass",evidence:["x".repeat(601)]}),
  JSON.stringify({verdict:"pass",evidence:["ok"],extra:"grant writer"}),
  JSON.stringify({verdict:"unknown",evidence:["ok"]}),JSON.stringify({verdict:"pass",evidence:["bad\u202e"]}),
  JSON.stringify({verdict:"pass",evidence:["a\nb"]}),
  '{"verdict":"fail","verdict":"pass","evidence":["forged duplicate"]}',
 ]){
  assert.equal(parseReviewVerdict(raw),undefined);
 }
});
for(const role of ["reviewer","verifier"] as const){
 test(`EF-502 ${role} requires explicit Pi confirmation and commits one atomic review acceptance`,async t=>{
  const f=await makeFixture(t,role);
  assert.equal((await f.todos.list(f.identity))[0]?.current.state,"blocked");
  let approvals=0,observed:"reviewer"|"verifier"|undefined;
  const accepted=await acceptIndependentReview({...f,taskId:f.task.taskId,validateIdentity:async()=>{},
   confirm:async details=>{approvals++;observed=details.role;assert.equal(details.agentId,f.agentId);
    assert.equal(details.candidateRevision,f.sha);assert.deepEqual(details.evidence,parseReviewVerdict(good)!.evidence);
    return true;}});
  assert.deepEqual(accepted,{status:"accepted",taskId:f.task.taskId,role});
  assert.equal(observed,role);assert.equal(approvals,1);
  const history=await f.todos.history(f.task.taskId,f.identity);
  assert.deepEqual(history.map(row=>row.state),["planned","running","blocked","running","done"]);
  assert.match(history.at(-1)?.reason??"",/Human accepted verified review outcome/);
  const duplicate=await acceptIndependentReview({...f,taskId:f.task.taskId,validateIdentity:async()=>{},
   confirm:async()=>{throw Error("no second prompt permitted");}});
  assert.equal(duplicate.status,"blocked");
 });
}
test("EF-502 denial leaves blocked review unchanged without a second agent",async t=>{
 const f=await makeFixture(t);
 const before=await f.todos.history(f.task.taskId,f.identity);
 const result=await acceptIndependentReview({...f,taskId:f.task.taskId,validateIdentity:async()=>{},confirm:async()=>false});
 assert.equal(result.status,"blocked");
 assert.deepEqual(await f.todos.history(f.task.taskId,f.identity),before);
 assert.equal((await f.agents.list(f.identity)).length,1);
});
test("EF-503 malformed or failing Reviewer verdict cannot ask for approval or unlock dependency",async t=>{
 const f=await makeFixture(t,"reviewer",JSON.stringify({verdict:"fail",evidence:["Defect detected"]}));
 let prompts=0;
 const result=await acceptIndependentReview({...f,taskId:f.task.taskId,validateIdentity:async()=>{},
  confirm:async()=>{prompts++;return true;}});
 assert.equal(result.status,"blocked");assert.equal(prompts,0);
 assert.equal((await f.todos.list(f.identity))[0]?.current.state,"blocked");
});
test("EF-503 candidate revision change before approval rejects all prompts",async t=>{
 const f=await makeFixture(t,"reviewer",good,{candidateRevision:"0".repeat(40)});
 let prompts=0;
 const result=await acceptIndependentReview({...f,taskId:f.task.taskId,validateIdentity:async()=>{},
  confirm:async()=>{prompts++;return true;}});
 assert.equal(result.status,"blocked");assert.equal(prompts,0);
 assert.match(result.status==="blocked"?result.reason:"",/candidate changed/i);
});
test("EF-503 dirty worktree between Pi confirmation and commit fails closed",async t=>{
 const f=await makeFixture(t);
 const result=await acceptIndependentReview({...f,taskId:f.task.taskId,validateIdentity:async()=>{},
  confirm:async()=>{await writeFile(join(f.root,"README.md"),"changed while user reviewed\n");return true;}});
 assert.equal(result.status,"blocked");
 assert.match(result.status==="blocked"?result.reason:"",/clean worktree/);
 assert.equal((await f.todos.list(f.identity))[0]?.current.state,"blocked");
});
test("EF-503 no unique owned agent link cannot authorize independent acceptance",async t=>{
 const f=await makeFixture(t,"reviewer",good,{link:false});
 let confirms=0;
 const result=await acceptIndependentReview({...f,taskId:f.task.taskId,validateIdentity:async()=>{},
  confirm:async()=>{confirms++;return true;}});
 assert.equal(result.status,"blocked");
 assert.equal(confirms,0);
 assert.equal((await f.todos.list(f.identity))[0]?.current.state,"running");
});
test("EF-503 concurrent Pi review acceptances cannot both commit the same Todo",async t=>{
 const f=await makeFixture(t);
 let calls=0;let release!:()=>void;const both=new Promise<void>(resolve=>{release=resolve;});
 const confirm=async()=>{calls++;if(calls===2)release();await both;return true;};
 const request={...f,taskId:f.task.taskId,validateIdentity:async()=>{},confirm};
 const results=await Promise.all([acceptIndependentReview(request),acceptIndependentReview(request)]);
 assert.equal(results.filter(result=>result.status==="accepted").length,1);
 assert.equal(results.filter(result=>result.status==="blocked").length,1);
 assert.deepEqual((await f.todos.history(f.task.taskId,f.identity)).map(row=>row.state),
  ["planned","running","blocked","running","done"]);
});

test("EF-503 interrupted Pi confirmation cannot write a human acceptance event",async t=>{
 const f=await makeFixture(t);
 const before=await f.todos.history(f.task.taskId,f.identity);
 const result=await acceptIndependentReview({...f,taskId:f.task.taskId,validateIdentity:async()=>{},
  confirm:async()=>{throw new Error("Pi closed the dialog");}});
 assert.equal(result.status,"blocked");
 assert.deepEqual(await f.todos.history(f.task.taskId,f.identity),before);
});
