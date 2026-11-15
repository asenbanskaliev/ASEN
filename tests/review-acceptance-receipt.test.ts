// T3.2: the live independent-review acceptance path must authenticate an
// HMAC-signed review receipt when one exists for the candidate commit, bind it
// to the exact candidate tree, and expose the signed test counts to the human
// confirmation. Without a receipt, acceptance falls back to structural
// verification and must declare that fallback.
import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp,mkdir,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {TaskAgentLinkStore} from "../src/runtime/agents/task-agent-link-store.js";
import {SessionTodoStore} from "../src/runtime/lifecycle/todo-store.js";
import {TaskAgentTodoReconciler} from "../src/runtime/agents/task-agent-reconciler.js";
import {acceptIndependentReview} from "../src/runtime/lifecycle/review-acceptance.js";
import {
  createReviewReceiptSigned,
  loadReceiptSigningKey,
  writeReviewReceipt
} from "../src/evidence/review-receipt.js";
import {ReceiptVerifierService} from "../src/evidence/receipt-verifier.js";
import {selectSkills,type SkillSelectionContext} from "../src/skills/registry.js";

const passingVerdict=JSON.stringify({
  verdict:"pass",
  evidence:["Test passed on the scoped candidate","Reviewed the exact Git revision"]
});

async function makeFixture(t:import("node:test").TestContext){
  const home=await mkdtemp(join(tmpdir(),"asen-review-receipt-"));
  t.after(()=>rm(home,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
  const root=join(home,"repo");await mkdir(root);await writeFile(join(root,"README.md"),"base\n");
  execFileSync("git",["init","-q",root]);
  execFileSync("git",["-C",root,"add","README.md"]);
  execFileSync("git",["-C",root,"-c","user.name=AsenTest","-c","user.email=test@example.invalid","commit","-q","-m","base"]);
  const sha=execFileSync("git",["-C",root,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
  const treeSha=execFileSync("git",["-C",root,"rev-parse","HEAD^{tree}"],{encoding:"utf8"}).trim();
  const identity={sessionId:"review-session",projectId:root},todos=await SessionTodoStore.open(join(home,"todos.json"));
  const links=new TaskAgentLinkStore(join(home,"links.json"));
  const role="reviewer" as const;
  const selection:SkillSelectionContext={phase:"adversarial-review",risk:"low",codeChange:false,behaviorChange:false,filesTouched:0};
  const [task]=await todos.addPlan([{requestId:"asen-plan:review-reviewer",title:"Independent review",
   dependsOn:[],description:"Check only the exact frozen candidate",
   plan:{role,priority:1,skillSelection:selection,skillPaths:selectSkills(selection).map(x=>x.path),
    candidateRevision:sha}}],identity);
  assert.ok(task);
  await todos.update(task!.taskId,identity,1,"running");
  const agents=await AgentRuntime.open({storeFile:join(home,"agents.json"),runner:{
   run:async request=>({id:request.id,ok:true,output:passingVerdict}),
  }});
  let done!:()=>void;const terminal=new Promise<void>(resolve=>{done=resolve;});
  const unsubscribe=agents.subscribeTerminal(record=>{if(record.state==="completed")done();});t.after(unsubscribe);
  const agentId=await agents.startReadOnly({role,prompt:"Independently verify",session:identity,skillSelection:selection});
  await links.bind({taskId:task!.taskId,agentId,sessionId:identity.sessionId,projectId:identity.projectId,createdAt:new Date().toISOString()});
  await terminal;
  await new TaskAgentTodoReconciler(todos,agents,links).reconcile(identity);
  const receiptsDir=join(home,"receipts");
  return {home,root,sha,treeSha,identity,todos,links,agents,task:task!,agentId,receiptsDir};
}

async function writeSignedReceipt(f:Awaited<ReturnType<typeof makeFixture>>,overrides:{treeSha?:string;passed?:number}={}){
  const key=await loadReceiptSigningKey(f.receiptsDir);
  const receipt=createReviewReceiptSigned({
   commitSha:f.sha,treeSha:overrides.treeSha??f.treeSha,oddTask:"odd/tasks/example.md",
   testSuite:{total:3,passed:overrides.passed??3,failed:0,durationMs:120,runner:"node --test"},
   verdict:"PASSED"
  },key);
  const file=await writeReviewReceipt(f.receiptsDir,receipt);
  return {key,receipt,file};
}

test("T3.2 a tampered HMAC receipt blocks an otherwise passing independent review",async t=>{
  const f=await makeFixture(t);
  const {file}=await writeSignedReceipt(f);
  // Tamper with the persisted receipt: the signed payload no longer matches.
  const stored=JSON.parse(await readFile(file,"utf8")) as Record<string,unknown>;
  stored.testSuite={...(stored.testSuite as Record<string,unknown>),passed:99};
  await writeFile(file,JSON.stringify(stored,null,2)+"\n","utf8");
  let prompted=false;
  const result=await acceptIndependentReview({
   todos:f.todos,agents:f.agents,links:f.links,identity:f.identity,taskId:f.task.taskId,
   receipts:new ReceiptVerifierService(f.receiptsDir),
   validateIdentity:async()=>{},
   confirm:async()=>{prompted=true;return true;}});
  assert.equal(result.status,"blocked");
  assert.match((result as {reason:string}).reason,/receipt/i);
  assert.equal(prompted,false,"a tampered receipt must never reach the human confirmation");
  const history=await f.todos.history(f.task.taskId,f.identity);
  assert.deepEqual(history.map(row=>row.state),["planned","running","blocked"],"the review must stay blocked");
});

test("T3.2 an authentic HMAC receipt is bound to the candidate tree and exposes the signed test counts",async t=>{
  const f=await makeFixture(t);
  await writeSignedReceipt(f);
  let verification:unknown;
  const result=await acceptIndependentReview({
   todos:f.todos,agents:f.agents,links:f.links,identity:f.identity,taskId:f.task.taskId,
   receipts:new ReceiptVerifierService(f.receiptsDir),
   validateIdentity:async()=>{},
   confirm:async details=>{verification=details.verification;return true;}});
  assert.deepEqual(result,{status:"accepted",taskId:f.task.taskId,role:"reviewer"});
  assert.deepEqual(verification,{
   mode:"signed-receipt",treeSha:f.treeSha,total:3,passed:3,failed:0,runner:"node --test"});
});

test("T3.2 a receipt for a different tree cannot certify the current candidate",async t=>{
  const f=await makeFixture(t);
  await writeSignedReceipt(f,{treeSha:"0".repeat(40)});
  const result=await acceptIndependentReview({
   todos:f.todos,agents:f.agents,links:f.links,identity:f.identity,taskId:f.task.taskId,
   receipts:new ReceiptVerifierService(f.receiptsDir),
   validateIdentity:async()=>{},
   confirm:async()=>true});
  assert.equal(result.status,"blocked");
  assert.match((result as {reason:string}).reason,/tree/i);
});

test("T3.2 without a receipt the acceptance declares the structural fallback",async t=>{
  const f=await makeFixture(t);
  let verification:unknown;
  const result=await acceptIndependentReview({
   todos:f.todos,agents:f.agents,links:f.links,identity:f.identity,taskId:f.task.taskId,
   receipts:new ReceiptVerifierService(f.receiptsDir),
   validateIdentity:async()=>{},
   confirm:async details=>{verification=details.verification;return true;}});
  assert.deepEqual(result,{status:"accepted",taskId:f.task.taskId,role:"reviewer"});
  assert.deepEqual(verification,{mode:"structural-fallback"});
});
