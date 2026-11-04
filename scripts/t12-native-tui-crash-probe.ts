/** EF-604 authentic native Pi TUI parent dies while a genuine Pi RPC process is
 * active. No inference, no credentials and no Writer. This is a subprocess
 * lifecycle fixture, NOT an interrupted Beam generation.
 */
import {spawn} from "node:child_process";
import {writeFileSync,readFileSync,realpathSync,existsSync} from "node:fs";
import {join} from "node:path";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {AgentNotificationJournal} from "../src/runtime/agent-notification-journal.js";
const home=process.env.ASEN_TUI_CRASH_HOME;
const marker=process.env.ASEN_TUI_CRASH_MARKER;
const phase=process.env.ASEN_TUI_CRASH_PHASE;
const binary=process.env.ASEN_TUI_CRASH_PI_BINARY;
const idFile=process.env.ASEN_TUI_CRASH_IDENTITY;
if(!home||!marker||!idFile||!binary||!["start","reopen"].includes(phase??""))
 throw Error("Pinned isolated Pi TUI crash fixture is incomplete");
const store=join(home,".asen","agents.json");
const ledger=join(home,".asen","agent-notices.json");
type Scope={sessionId:string;projectId:string};
const noModel=()=>{throw Error("MODEL_TURN_FORBIDDEN_FOR_TUI_CRASH_FIXTURE");};
export default function(pi:any):void{
 pi.on("before_agent_start",noModel);
 pi.on("session_start",async(_event:unknown,ctx:any)=>{
  try{
   const scope:Scope={sessionId:ctx.sessionManager.getSessionId(),projectId:realpathSync(ctx.cwd)};
   if(phase==="start"){
    // Pi 1.2 SessionManager._hasConversation() does NOT persist JSONL for
    // extension entries alone. Supply one explicitly synthetic user-message
    // fixture directly to the manager: no agent turn, no API key, no consent.
    // This is a disposable Pi session file, never an actual user's transcript.
    if(typeof pi.appendEntry!=="function"||
       typeof ctx.sessionManager.appendMessage!=="function")
     throw Error("Native Pi session persistence API unavailable");
    pi.appendEntry("asen.ef604.tui-crash-seed",{readOnly:true,modelCalls:0});
    ctx.sessionManager.appendMessage({role:"user",
     content:[{type:"text",text:"ASEN_SYNTHETIC_TUI_CRASH_SESSION_FIXTURE_NO_MODEL_TURN"}],
     timestamp:Date.now()});
    const sessionFile=ctx.sessionManager.getSessionFile?.();
    if(typeof sessionFile!=="string"||!existsSync(sessionFile))
     throw Error("Native Pi session file did not persist before forced TUI death");
    let started=false;
    const runtime=await AgentRuntime.open({storeFile:store,maxConcurrency:1,runner:{
     run:async request=>{
      if(started)throw Error("SECOND_PI_CHILD_FORBIDDEN");
      started=true;
      const env={...process.env};
      for(const key of Object.keys(env))
       if(/(?:API_KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL)/iu.test(key)||key.startsWith("GIT_"))
        delete env[key];
      const child=spawn(process.execPath,[binary,"--mode","rpc","--no-extensions","--no-skills","--no-builtin-tools"],
       {cwd:scope.projectId,env,stdio:["pipe","pipe","pipe"],windowsHide:true});
      const childPid=child.pid;
      if(!childPid||!child.stdout||!child.stdin)throw Error("Native Pi RPC child pipes unavailable");
      const childStdout=child.stdout,childStdin=child.stdin;
      let stdout="",verified=false;
      childStdout.setEncoding("utf8");
      childStdout.on("data",(data:string)=>{
       stdout+=data;
       if(stdout.length>160000){child.kill();return;}
       let newline;
       while((newline=stdout.indexOf("\n"))>=0){
        const text=stdout.slice(0,newline).trim();stdout=stdout.slice(newline+1);
        let json:any;
        try{json=JSON.parse(text);}catch{continue;}
        if(json?.type==="response"&&json.id==="owned-rpc-get-state"&&json.success===true&&
           json.command==="get_state"&&!verified){
         verified=true;
         // Both an actual Pi TUI host and genuine Pi RPC child process exist.
         // This code is running inside the original ASEN agent runner, not an
         // observer fabricating a completed lifecycle record.
         void (async()=>{
          const task=(await runtime.query(request.id,scope))?.record;
          if(task?.state!=="running")throw Error("Durable task not running");
          const journal=new AgentNotificationJournal(ledger);
          const pending=await journal.record({...scope,id:"tui-crash-fixture-pending",state:"completed"});
          const attempted=await journal.record({...scope,id:"tui-crash-fixture-attempted",state:"failed"});
          if(!await journal.claim(attempted.eventId,scope))throw Error("Fixture claim failed");
          writeFileSync(idFile,JSON.stringify({scope,sessionFile,agentId:request.id,parentPid:process.pid,
           childPid,noticeEvents:[pending.eventId,attempted.eventId],nativePiRpcGetState:true}));
          writeFileSync(marker,JSON.stringify({phase,ready:true,modelCalls:0}));
         })().catch(error=>writeFileSync(marker,JSON.stringify({phase,error:String(error)})));
        }
       }
      });
      child.on("error",error=>writeFileSync(marker,JSON.stringify({phase,error:error.message})));
      childStdin.write(JSON.stringify({id:"owned-rpc-get-state",type:"get_state"})+"\n");
      return new Promise<never>(()=>{/* Deliberately active until TUI host SIGKILL */});
     }
    }});
    await runtime.startReadOnly({role:"explorer",prompt:"Provider-free real Pi RPC process remains active; never run inference",session:scope});
   }else{
    const original=JSON.parse(readFileSync(idFile,"utf8"));
    if(original.scope.sessionId!==scope.sessionId||original.scope.projectId!==scope.projectId)
     throw Error("Native Pi TUI restart did not preserve exact session/project");
    if(original.sessionFile!==ctx.sessionManager.getSessionFile?.())
     throw Error("Native Pi TUI did not reload the same session JSONL file");
    const events=ctx.sessionManager.getEntries?.();
    if(!Array.isArray(events)||!events.some((entry:any)=>
      entry?.type==="custom"&&entry.customType==="asen.ef604.tui-crash-seed"&&
      entry.data?.readOnly===true&&entry.data?.modelCalls===0))
     throw Error("Restarted Pi session did not read the durable extension seed");
    if(!events.some((entry:any)=>entry?.type==="message"&&entry.message?.role==="user"&&
       Array.isArray(entry.message.content)&&entry.message.content.some((part:any)=>
        part?.type==="text"&&part.text==="ASEN_SYNTHETIC_TUI_CRASH_SESSION_FIXTURE_NO_MODEL_TURN")))
     throw Error("Restarted Pi TUI did not load the synthetic persistence fixture message");
    let dispatches=0;
    const runtime=await AgentRuntime.open({storeFile:store,maxConcurrency:1,
     runner:{run:async()=>{dispatches++;throw Error("AUTOMATIC_PROVIDER_REPLAY_FORBIDDEN");}}});
    const observed=await runtime.list(scope);
    if(observed.length!==1||observed[0]?.id!==original.agentId||
       observed[0]?.state!=="interrupted"||observed[0]?.role!=="explorer")
     throw Error("Interrupted durable Pi task missing or silently promoted");
    const journal=new AgentNotificationJournal(ledger),notices=await journal.list(scope);
    const pending=notices.find(e=>e.eventId===original.noticeEvents[0]);
    const attempted=notices.find(e=>e.eventId===original.noticeEvents[1]);
    if(notices.length!==2||pending?.delivery!=="pending"||attempted?.delivery!=="attempted")
     throw Error("Pending/uncertain notice state changed during real Pi TUI restart");
    if(await journal.claim(attempted.eventId,scope))throw Error("Uncertain notice silently replayed");
    let ackBlocked=0;
    for(const notice of notices){
     try{await journal.acknowledge(notice.eventId,scope,notice.agentId,notice.state);}
     catch{ackBlocked++;}
    }
    if(ackBlocked!==2||dispatches!==0)throw Error("Undelivered notice acquired coordinator authority");
    writeFileSync(marker,JSON.stringify({phase,ready:true,scope,agentId:original.agentId,
     parentPid:process.pid,interrupted:true,pendingCount:1,uncertainCount:1,
     ackBlocked,modelCalls:0,replayedCalls:dispatches,writerAuthorized:false}));
    setTimeout(()=>ctx.shutdown(),250);
   }
  }catch(error){
   writeFileSync(marker,JSON.stringify({phase,error:error instanceof Error?error.message:"unknown"}));
   if(phase==="reopen")setTimeout(()=>ctx.shutdown(),100);
  }
 });
}
