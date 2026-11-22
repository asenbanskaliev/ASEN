import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdir,mkdtemp,realpath,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {createPiExtension} from "../extensions/asen.js";
import type {AgentRequest} from "../src/agents/dispatcher.js";
import {createReviewReceiptSigned,loadReceiptSigningKey,writeReviewReceipt} from "../src/evidence/review-receipt.js";
import {writeProfilesFile} from "../src/runtime/lifecycle/profile-store.js";
import {ASEN_PROFILES_SCHEMA} from "../src/runtime/lifecycle/profiles.js";

test("E3: a named escalation keeps candidate acceptance gated after author tests and a passing Reviewer",async t=>{
 const home=await realpath(await mkdtemp(join(tmpdir(),"asen-e3-runtime-")));
 const shutdown:Array<()=>Promise<void>>=[];
 t.after(async()=>{try{for(const stop of shutdown.reverse())await stop();}
  finally{await rm(home,{recursive:true,force:true,maxRetries:20,retryDelay:100});}});
 const project=join(home,"candidate"),surface="value.cjs";
 await mkdir(project);
 await writeFile(join(project,surface),"module.exports = 2;\n");
 // Only a fixture object and detached HEAD; no branch updates or commits in the real checkout.
 const git=(args:string[],input?:string)=>execFileSync("git",args,{cwd:project,encoding:"utf8",input}).trim();
 git(["init","-q","--object-format=sha1"]);
 git(["config","--local","core.autocrlf","false"]);
 // Match this repository's two exact exclusions for generated skill registry files.
 await writeFile(join(project,".git","info","exclude"),"/.asen/skill-registry.md\n/.asen/skill-registry.cache.json\n");
 const blob=git(["hash-object","-w","--",surface]);
 const tree=git(["mktree"],`100644 blob ${blob}\t${surface}\n`);
 const revision=git(["hash-object","-t","commit","-w","--stdin"],
  `tree ${tree}\nauthor ASEN Test <test@example.invalid> 1 +0000\ncommitter ASEN Test <test@example.invalid> 1 +0000\n\nFrozen fixture\n`);
 await writeFile(join(project,".git","HEAD"),`${revision}\n`);
 git(["read-tree",tree]);
 const facts={taskIdentity:"proportional-runtime",instruction:"Check the bounded behavior change in value.cjs",
  intent:"implementation",scope:{kind:"known",expectedPaths:[surface]},writes:[{path:surface,changeKind:"behavior"}],
  riskOperations:[],session:{estimatedMinutes:10,continuation:false},testing:{kind:"required"},
  review:{kind:"ordinary",estimatedMinutes:5},unresolvedDecisions:[]};
 for(const escalated of [false,true]){
  const state=join(home,escalated?"named-risk":"medium"),profilesFile=join(state,"profiles.json");
  await mkdir(state);
  await writeProfilesFile(profilesFile,{schema:ASEN_PROFILES_SCHEMA,active:"offline",profiles:[{
   name:"offline",mode:"full-delegation",routes:{worker:{model:"local/author"},reviewer:{model:"local/reviewer"},verifier:{model:"local/verifier"}},
  }]});
  const commands=new Map<string,{handler:(args:string,ctx:unknown)=>unknown}>(),tools=new Map<string,any>();
  const events=new Map<string,Array<(event:unknown,ctx:unknown)=>unknown>>(),requests:AgentRequest[]=[];
  const prompts:string[]=[],notifications:string[]=[];
  let authorTests=0;
  const ctx={cwd:project,mode:"tui",hasUI:true,sessionManager:{getSessionId:()=>"e3",getEntries:()=>[]},
   modelRegistry:{find:(provider:string,id:string)=>({provider,id,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}})},
   ui:{notify(message:string){notifications.push(message);},setStatus(){},setWidget(){},confirm:async(title:string)=>{prompts.push(title);return true;}}};
  createPiExtension({homeDir:()=>state,profilesFile,todoStoreFile:join(state,"todos.json"),
   agentStoreFile:join(state,"agents.json"),enableMemoryRuntime:false,enableWorkspaceRuntime:false,autoAdvancePlans:false,
   // Fake agent runner: the local assertion is real; the agent verdict is not independent review evidence.
   agentRunner:{run:async request=>{
    requests.push(request);
    if(request.role==="worker"){
     execFileSync(process.execPath,["-e","require('node:assert/strict').equal(require('./value.cjs'), 2)"],{cwd:project});
     authorTests++;
     const receipts=join(state,".asen","receipts");
     await writeReviewReceipt(receipts,createReviewReceiptSigned({commitSha:revision,treeSha:tree,
      oddTask:"odd/tasks/continuacion-local-flujo-de-agentes.md",testSuite:{total:1,passed:1,failed:0,durationMs:0,runner:"node -e"},
      verdict:"PASSED"},await loadReceiptSigningKey(receipts)));
     return {id:request.id,ok:true,output:"Author's local assertion passed"};
    }
    return {id:request.id,ok:true,output:JSON.stringify({verdict:"pass",evidence:["Synthetic passing verdict for the isolated fixture"]})};
   }},
  })({registerTool:(tool:any)=>tools.set(tool.name,tool),registerCommand:(name:string,command:any)=>commands.set(name,command),
   getCommands:()=>[],getAllTools:()=>[],on:(name:string,handler:any)=>events.set(name,[...(events.get(name)??[]),handler]),
  } as any);
  shutdown.push(async()=>{for(const stop of events.get("session_shutdown")??[])await stop({},ctx);});
  for(const start of events.get("session_start")??[])await start({reason:"new"},ctx);
  const command=async(name:string,args:string)=>commands.get(name)!.handler(args,ctx);
  let callId=0;
  const invoke=async(name:string,params:object={})=>(await tools.get(name).execute(`e3-${++callId}`,params,new AbortController().signal,()=>{},ctx)).details;
  const rows=async()=>await invoke("asen_todo_list") as Array<{
   taskId:string;dependsOn?:string[];current:{state:string;revision:number;reason?:string};
   plan?:{role:string;model?:string;candidateRevision?:string;candidate?:{revision:string};writeSurfaces?:string[]};
  }>;
  const waitFor=async(role:string,state:string,agentId:string)=>{
   const until=Date.now()+30_000;
   do{
    const row=(await rows()).find(item=>item.plan?.role===role);
    if(row?.current.state===state)return row;
    if(row?.current.state==="blocked"){
     const linked=await invoke("asen_agent_status",{id:agentId});
     assert.fail(`Expected ${role} to reach ${state}; blocked: ${JSON.stringify({reason:row.current.reason,linked,authorTests})}`);
    }
    await delay(20);
   }while(Date.now()<until);
   assert.fail(`Expected ${role} to reach ${state}; observed ${JSON.stringify((await rows()).map(x=>[x.plan?.role,x.current.state,x.current.reason]))}`);
  };
  // The test authors the structured risk on the public command, not in a model's verdict.
  const beforePlan=notifications.length;
  await command("asen-plan",JSON.stringify({...facts,
   ...(escalated?{namedRisks:[{item:3,reason:"The value is consumed by a separate fixture client"}]}:{}),
  }));
  assert.equal(notifications.length,beforePlan+1,"The public plan command must emit its result through Pi UI");
  const planned=JSON.parse(notifications[beforePlan]!);
  assert.equal(planned.risk,"medium");
  assert.deepEqual((await rows()).map(row=>row.plan?.role),escalated?["worker","reviewer","verifier"]:["worker"]);
  const dirty=git(["status","--porcelain=v1","--untracked-files=all"]);
  assert.equal(dirty,"","The isolated Git fixture must be clean before invoking the Writer");
  const writer=await invoke("asen_plan_dispatch_next");
  assert.equal(writer.role,"worker",writer.reason);
  const workerTodo=await waitFor("worker","succeeded",writer.agentId);
  assert.equal(requests[0]?.candidate?.revision,revision);
  assert.deepEqual(requests[0]?.writeSurfaces,[surface]);
  assert.equal(authorTests,1);
  if(escalated){
   const reviewer=await invoke("asen_plan_dispatch_next");
   assert.equal(reviewer.role,"reviewer",reviewer.reason);
   const reviewerTodo=await waitFor("reviewer","blocked",reviewer.agentId);
   const verifier=(await rows()).find(row=>row.plan?.role==="verifier");
   assert.ok(verifier,"An escalated plan must materialize a Verifier Todo");
   assert.deepEqual(verifier.dependsOn?.slice().sort(),[reviewerTodo.taskId,workerTodo.taskId].sort());
   assert.equal(verifier.plan?.candidateRevision,revision);
   assert.equal(verifier.plan?.model,"local/verifier");
   assert.equal(verifier.current.state,"planned");
   assert.equal((await invoke("asen_plan_dispatch_next")).status,"blocked");
   assert.deepEqual(requests.map(r=>r.role),["worker","reviewer"]);
   const beforeAccept=prompts.length;
   await command("asen-accept-review",verifier.taskId);
   assert.equal(prompts.length,beforeAccept,"A planned Verifier cannot prompt for acceptance");
   await command("asen-accept-review",reviewerTodo.taskId);
   assert.equal((await rows()).find(row=>row.taskId===reviewerTodo.taskId)?.current.state,"done");
   const dispatched=await invoke("asen_plan_dispatch_next");
   assert.equal(dispatched.role,"verifier",dispatched.reason);
   const result=await waitFor("verifier","blocked",dispatched.agentId);
   assert.equal(result.taskId,verifier.taskId);
   assert.deepEqual(requests.map(r=>r.role),["worker","reviewer","verifier"]);
   const beforeVerifierAcceptance=prompts.length;
   await command("asen-accept-review",result.taskId);
   assert.equal(prompts.length,beforeVerifierAcceptance+1);
   assert.equal((await rows()).find(row=>row.taskId===result.taskId)?.current.state,"done");
  }else{
   assert.equal((await invoke("asen_plan_dispatch_next")).status,"blocked");
   assert.deepEqual(requests.map(r=>r.role),["worker"]);
   assert.equal(prompts.length,1,"Only the Writer launch has been confirmed");
  }
  const beforeWriterAcceptance=prompts.length;
  await invoke("asen_todo_accept_result",{id:workerTodo.taskId,agentId:writer.agentId,
   revision:workerTodo.current.revision,evidence:"The scoped author assertion passed on the frozen candidate"});
  assert.equal(prompts.length,beforeWriterAcceptance+1);
  assert.equal((await rows()).find(row=>row.taskId===workerTodo.taskId)?.current.state,"done");
 }
});
