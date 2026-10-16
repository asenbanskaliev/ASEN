import {mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {createPiExtension} from "../extensions/asen.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {PersistentAgentStore} from "../src/runtime/agent-store.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {writeProfilesFile} from "../src/runtime/profile-store.js";
import {ASEN_PROFILES_SCHEMA} from "../src/runtime/profiles.js";

const root=process.env.ASEN_ECO06_SOURCE_ROOT;
const home=process.env.ASEN_ECO06_HOME;
const project=process.env.ASEN_ECO06_PROJECT;
const sessionId=process.env.ASEN_ECO06_SESSION_ID;
const phase=process.env.ASEN_ECO06_PHASE;
const mode=process.env.ASEN_ECO06_MODE;
const target=path.join(project,"README.md");
const model="nvidia/nemotron-3.5-lightning-30b-a3b";
const identity={sessionId,projectId:project};
const events=new Map(),commands=new Map(),tools=new Map(),messages=[];
const pi={on(name,handler){events.set(name,[...(events.get(name)??[]),handler]);},registerCommand(name,command){commands.set(name,command);},registerTool(tool){tools.set(tool.name,tool);},getCommands(){return[];},getAllTools(){return[];}};
const send=value=>{if(process.connected)process.send(value);};
const ui={notify:message=>messages.push(String(message)),confirm:async(title,message)=>{send({kind:"authorization",title:String(title),message:String(message),phase});return true;},setWidget(){}};
const context={mode:"rpc",hasUI:true,cwd:project,sessionManager:{getSessionId:()=>sessionId},ui};
const profilesFile=path.join(home,".asen","profiles.json"),agentFile=path.join(home,".asen","agents.json"),todoRoot=path.join(home,".asen","todos"),legacyTodoFile=path.join(home,".asen","todos.json");
await Promise.all([mkdir(path.dirname(profilesFile),{recursive:true}),mkdir(todoRoot,{recursive:true})]);
await writeProfilesFile(profilesFile,{schema:ASEN_PROFILES_SCHEMA,active:"eco06-nvidia",profiles:[{name:"eco06-nvidia",routes:{worker:{model,thinking:"low"},reviewer:{model,thinking:"low"},verifier:{model,thinking:"low"}}}]});
const piPackage=JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../node_modules/@earendil-works/pi-coding-agent/package.json",import.meta.url),"utf8"));
const piRoot=path.dirname(fileURLToPath(new URL("../node_modules/@earendil-works/pi-coding-agent/package.json",import.meta.url)));
const baseRunner=new PiProcessRunner({command:path.resolve(piRoot,piPackage.bin.pi),providerCredential:"NVIDIA_API_KEY",policyRoot:root,timeoutMs:180_000});
const invocations=[];
const runner={run:async(request,signal)=>{
  invocations.push({id:request.id,role:request.role,writeSurfaces:request.writeSurfaces??[]});
  if(mode==="interrupt"&&phase==="first"&&request.role==="worker"){
    const initial=await import("node:fs/promises").then(fs=>fs.readFile(target,"utf8"));
    const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    const running=baseRunner.run(request,combined);
    let settled=false;void running.finally(()=>{settled=true;}).catch(()=>{});
    const deadline=Date.now()+160_000;
    while(Date.now()<deadline){
      const current=await import("node:fs/promises").then(fs=>fs.readFile(target,"utf8"));
      if(current!==initial){
        send({kind:"partial-write",id:request.id,role:request.role,path:"README.md",sha256:(await import("node:crypto")).createHash("sha256").update(current).digest("hex")});
        await new Promise(resolve=>process.once("message",message=>{if(message?.kind==="interrupt")resolve();}));
        controller.abort();
        process.kill(process.pid,"SIGKILL");
      }
      if(settled){
        const result=await running;
        const output=typeof result.output==="string"?result.output:"";
        const key=process.env.NVIDIA_API_KEY;
        const diagnostic=output.replaceAll(key||"\u0000","[REDACTED]").replace(/[\u0000-\u001f\u007f]/gu," ").trim().slice(0,500);
        send({kind:"writer-finished-without-partial",id:request.id,ok:result.ok,outputLength:output.length,diagnostic});
        return result;
      }
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    send({kind:"writer-finished-without-partial",id:request.id,ok:false,outputLength:0,diagnostic:"No visible edit before the 160-second observation deadline; cancelling the Pi worker"});
    controller.abort();
    return running;
  }
  return baseRunner.run(request,signal);
}};

createPiExtension({homeDir:()=>home,profilesFile,agentStoreFile:agentFile,todoStoreFile:legacyTodoFile,todoStoreFactory:()=>SessionTodoStore.openProjectScoped(todoRoot,legacyTodoFile),agentRunner:runner,autoAdvancePlans:false})(pi);
await events.get("session_start")?.[0]?.({},context);
send({kind:"ready",phase,invocations});

const selection=()=>({
  taskIdentity:phase==="first"?"eco06-live-first-write":"eco06-live-second-write",
  instruction:phase==="first"
    ?"Make one small, visible partial change to README.md by adding the line FIRST_WRITE: interrupted-before-completion. Do not edit any other path."
    :"Append exactly one line SECOND_WRITE: freshly-authorized to README.md. Do not edit any other path or repeat an existing SECOND_WRITE line.",
  intent:"implementation",scope:{kind:"known",expectedPaths:["README.md"]},
  writes:[{path:"README.md",changeKind:"documentation"}],riskOperations:[],
  session:{estimatedMinutes:10,continuation:false},testing:{kind:"required"},
  review:{kind:"dual_explicit",estimatedMinutes:5},unresolvedDecisions:[]
});

process.on("message",async message=>{
  if(!message||typeof message!="object"||typeof message.id!=="string")return;
  try{
    let result;
    if(message.op==="plan"){
      const handler=commands.get("asen-plan")?.handler;if(!handler)throw new Error("ASEN planning command is unavailable");
      await handler(JSON.stringify(selection()),context);result=JSON.parse(messages.at(-1));
    }else if(message.op==="dispatch"){
      result=await tools.get("asen_plan_dispatch_next").execute(message.id,{},new AbortController().signal,()=>{},context);
    }else if(message.op==="inspect"){
      const store=await PersistentAgentStore.open(agentFile),entries=await store.store.list(sessionId,project);
      const matches=entries.filter(row=>row.state==="interrupted"&&row.role==="worker");
      if(matches.length!==1)throw new Error(`Restart recovered ${matches.length} interrupted writers; expected exactly one`);
      const entry=matches[0];
      if(!entry)throw new Error("Restart did not recover exactly one interrupted writer");
      result=await tools.get("asen_todo_inspect_interrupted_write").execute(message.id,{agentId:entry.id},new AbortController().signal,()=>{},context);
    }else if(message.op==="accept"){
      result=await tools.get("asen_todo_accept_result").execute(message.id,message.args,new AbortController().signal,()=>{},context);
    }else if(message.op==="counts"){
      const store=await PersistentAgentStore.open(agentFile),entries=await store.store.list(sessionId,project);
      result={entries:entries.map(row=>({id:row.id,role:row.role,state:row.state})),invocations,messages:messages.slice(-8)};
    }else throw new Error(`Unknown ECO-06 harness operation: ${message.op}`);
    send({id:message.id,result});
  }catch(error){send({id:message.id,error:String(error?.stack??error)});}
});
