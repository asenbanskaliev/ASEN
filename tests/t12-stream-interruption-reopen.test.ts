import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtemp,mkdir,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {AgentNotificationJournal} from "../src/runtime/agent-notification-journal.js";

test("EF-604 provider-free cancelled Explorer survives a separate coordinator process with no replay",
 {timeout:90000},async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-interrupted-child-reopen-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const project=join(root,"project");await mkdir(project);
 const scope={sessionId:"owned-interruption-session",projectId:await realpath(project)};
 const store=join(root,"agents.json"),journal=join(root,"notices.json");
 let calls=0;
 let markRunnerStarted!:()=>void;
 const runnerStarted=new Promise<void>(resolve=>{markRunnerStarted=resolve;});
 const cancellable=await AgentRuntime.open({storeFile:store,runner:{
  run:async(request,signal)=>{
   calls++;markRunnerStarted();
   return new Promise((resolve,reject)=>{
    if(!signal)return reject(Error("Dispatcher did not pass AbortSignal"));
    const timeout=setTimeout(()=>reject(Error("Cancellation did not reach runner")),7000);
    const cancel=()=>{
     clearTimeout(timeout);
     resolve({id:request.id,ok:false,output:"cancelled while streaming"});
    };
    if(signal.aborted)cancel();else signal.addEventListener("abort",cancel,{once:true});
   });
  }
 }});
 const controller=new AbortController();
 const settled=new Promise<any>((resolveTerminal,reject)=>{
  const timer=setTimeout(()=>reject(Error("No persisted cancellation")),12000);
  const unsubscribe=cancellable.subscribeTerminal(record=>{
   clearTimeout(timer);unsubscribe();resolveTerminal(record);
  });
 });
 const id=await cancellable.startReadOnly({role:"explorer",session:scope,
  prompt:"Aborted provider-free stream never yields an authorized completion"},controller.signal);
 await runnerStarted;
 controller.abort();
 const terminal=await settled;
 assert.equal(terminal.id,id);
 assert.equal(terminal.state,"cancelled");
 assert.equal(calls,1);
 assert.equal((await cancellable.query(id,scope))?.record.state,"cancelled");
 const row=await new AgentNotificationJournal(journal).record({id,state:"cancelled",...scope});
 assert.equal(row.delivery,"pending");
 const env:NodeJS.ProcessEnv={...process.env,
  ASEN_STREAM_STORE:store,ASEN_STREAM_JOURNAL:journal,
  ASEN_STREAM_AGENT:id,ASEN_STREAM_SESSION:scope.sessionId,
  ASEN_STREAM_PROJECT:scope.projectId,
 };
 for(const key of Object.keys(env))
  if(/(?:API_KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL)/iu.test(key))delete env[key];
 const child=spawnSync(process.execPath,["--import","tsx",
  resolve("scripts/t12-stream-interruption-reopen.mjs")],{
  cwd:process.cwd(),env,encoding:"utf8",timeout:30000,windowsHide:true,
 });
 assert.equal(child.error,undefined);
 assert.equal(child.status,0,child.stderr);
 const proof=JSON.parse(child.stdout.trim());
 assert.equal(proof.result,"PASS_CANCELLED_PI_READONLY_REOPEN");
 assert.equal(proof.agentId,id);
 assert.equal(proof.replayedCalls,0);
 assert.equal(proof.writerAuthorized,false);
 assert.equal(calls,1);
 assert.deepEqual((await new AgentNotificationJournal(journal).list(scope))
  .map(x=>x.delivery),["pending"]);
});
