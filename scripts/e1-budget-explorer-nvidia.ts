/** E1: presupuesto real del código ASEN, host instrumentado y Explorer Pi
 * auténtico. No se fabrica una decisión natural ni se autoriza escritura. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {randomBytes} from "node:crypto";
import {tmpdir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {ModelRegistry,ModelRuntime,SessionManager} from "@earendil-works/pi-coding-agent";
import {createAsenExtension} from "../extensions/asen.js";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import type {AgentRunner} from "../src/agents/dispatcher.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {isolatedGitEnvironment} from "../src/runtime/agents/git-isolated-environment.js";
import {normalizeT06PiChildSelection} from "../src/runtime/agents/t06-pi-receipt-validator.js";

const root=realpathSync(resolve(process.env.GITHUB_WORKSPACE??process.cwd()));
const sha=process.env.ASEN_EXPECTED_SHA,output=process.env.ASEN_E1_EXPLORER_REPORT;
const model="nvidia/nemotron-3.5-lightning-30b-a3b";
assert.ok(output&&process.env.NVIDIA_API_KEY&&/^[a-f0-9]{40}$/u.test(sha??""));
const git=(cwd:string,...args:string[])=>execFileSync("git",["--no-replace-objects","-C",cwd,...args],{encoding:"utf8",env:isolatedGitEnvironment(),timeout:10000,stdio:["ignore","pipe","pipe"]}).trim();
assert.equal(git(root,"rev-parse","HEAD"),sha);assert.equal(git(root,"status","--porcelain=v1"),"");
const piDir=process.env.PI_CODING_AGENT_DIR;assert.ok(piDir);
const settings=JSON.parse(readFileSync(join(piDir,"settings.json"),"utf8"));
assert.equal(settings.retry?.enabled,false);assert.equal(settings.retry?.maxRetries,0);assert.equal(settings.retry?.provider?.maxRetries,0);
const base=realpathSync(mkdtempSync(join(tmpdir(),"asen-e1-explorer-")));
const project=join(base,"repo"),home=join(base,"home"),privateDir=join(home,".asen");
const report={schema:"asen.e1.explorer/v1",sha,model,status:"BLOCKED",globalFull:false,
 host:"INSTRUMENTED_PI_SESSION",budgetSource:"INSTRUMENTED_READ_EVENTS",stage:"fixture",autoRetry:false,
 beforeBudgetRejected:false,profileChanged:false,duplicateRejected:false,readOnly:false,launches:0,
 nativeSelected:false,processStarted:false,processClosed:false,toolReads:0,toolErrors:0,markerVerified:false,
 projectClean:false,providerResponseIdentity:"unknown",costVerified:false};
let agents:AgentRuntime|undefined,identity:{sessionId:string;projectId:string}|undefined;
let settled=false;
try{
 mkdirSync(project);mkdirSync(privateDir,{recursive:true,mode:0o700});
 const marker=randomBytes(12).toString("hex");
 writeFileSync(join(project,"entrada.txt"),marker+"\n");
 git(project,"init","-q","-b","ensayo");git(project,"config","user.name","ASEN");git(project,"config","user.email","test@example.invalid");
 git(project,"add","entrada.txt");git(project,"commit","--no-gpg-sign","-qm","Base");
 const revision=git(project,"rev-parse","HEAD");
 const profiles=join(privateDir,"profiles.json");
 writeFileSync(profiles,JSON.stringify({schema:"asen.runtime-profiles/v1",active:"normal",profiles:[
  {name:"normal",mode:"organic",routes:{explorer:{model,thinking:"minimal"}}},
  {name:"completo",mode:"full-delegation",routes:{explorer:{model,thinking:"minimal"}}}
 ]}));
 const parent=SessionManager.create(project,join(base,"sessions"));
 identity={sessionId:parent.getSessionId(),projectId:project};const owner=identity;
 const registry=new ModelRegistry(await ModelRuntime.create({authPath:join(privateDir,"auth.json"),modelsPath:join(privateDir,"models.json"),allowModelNetwork:true,modelRefreshTimeoutMs:30000}));
 const pi=new PiProcessRunner({command:"pi",policyRoot:root,providerCredential:"NVIDIA_API_KEY",
  requireChildModelBeforePrompt:true,timeoutMs:110000,maxOutputBytes:60000,maxStreamBytes:240000,
  onProcessStart:()=>{report.processStarted=true;},onProcessClose:()=>{report.processClosed=true;},
  onToolExecution:event=>{
   if(event.type==="tool_execution_end"&&event.isError)report.toolErrors++;
   if(event.type==="tool_execution_start"&&event.toolName==="read")report.toolReads++;
  }});
 pi.subscribeChildSelection(event=>{if(event.sessionId===owner.sessionId&&event.projectId===project)
  report.nativeSelected=normalizeT06PiChildSelection(event.model,model)===model;});
 const runner:AgentRunner={run:async(request,signal)=>{
  report.launches++;
  report.readOnly=request.role==="explorer"&&request.model===model&&request.repository===project&&request.isolationKey===owner.sessionId&&
   !request.writeSurfaces?.length&&!request.writerAdmission&&!request.phaseGrant&&!request.runnerWriteReceiver;
  if(!report.readOnly||report.launches!==1)return {id:request.id,ok:false,output:"Explorer fuera de alcance"};
  return pi.run(request,signal);
 }};
 agents=await AgentRuntime.open({storeFile:join(privateDir,"agents.json"),runner,maxConcurrency:1});const runtime=agents;
 const tools=new Map<string,any>(),commands=new Map<string,any>(),events=new Map<string,Array<(...args:any[])=>unknown>>();
 const extension=createAsenExtension({homeDir:()=>home,packageRoot:root,profilesFile:profiles,agentRuntimeFactory:async()=>runtime,
  enableWorkspaceRuntime:false,enableMemoryRuntime:false,enableTodoRuntime:false,autoAdvancePlans:false});
 extension({registerTool(tool){tools.set(tool.name,tool);},registerCommand(name,command){commands.set(name,command);},
  on(name,handler){events.set(name,[...(events.get(name)??[]),handler]);}});
 const context={cwd:project,mode:"rpc",hasUI:true,sessionManager:parent,modelRegistry:registry,isIdle:()=>true,
  ui:{notify(){},setWidget(){},setStatus(){},confirm:async()=>false}};
 for(const start of events.get("session_start")??[])await start({reason:"new"},context);
 const invoke=()=>tools.get("asen_agent_start").execute("budget",{
  prompt:"Lee entrada.txt con la herramienta read. Responde únicamente con su contenido, sin añadir texto. No modifiques nada.",budgetExplorer:true
 },new AbortController().signal,()=>{},context);
 report.stage="budget";
 await assert.rejects(invoke,/fresh, same-session read budget/u);
 report.beforeBudgetRejected=true;
 await commands.get("asen-profiles").handler("session completo",context);report.profileChanged=true;
 for(let i=0;i<4;i++)for(const handler of events.get("tool_execution_end")??[])await handler({
  toolCallId:"fixture-read-"+i,toolName:"read",isError:false,result:{content:[{type:"text",text:"lectura instrumentada"}]}
 },context);
 report.stage="native-explorer";
 const started=await invoke();assert.equal(started.details.role,"explorer");
 await assert.rejects(invoke,/fresh, same-session read budget/u);report.duplicateRejected=true;
 const id=started.details.id,deadline=Date.now()+345000;
 while(Date.now()<deadline){
  const row=(await runtime.list(owner)).find(x=>x.id===id);
  if(row&&["completed","failed","cancelled","interrupted"].includes(row.state)){settled=true;break;}
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 const entry=await runtime.entry(id,owner);
 assert.equal(entry?.record.state,"completed");assert.ok(entry.result);
 const messages=entry.result.output.split(/\r?\n/u).filter(Boolean).map(line=>JSON.parse(line));
 const replies=messages.filter(event=>event.type==="message_end"&&event.message?.role==="assistant");
 const final=replies.at(-1)?.message;
 assert.ok(final);assert.equal(final.stopReason,"stop");
 report.markerVerified=final.content.filter((part:{type:string})=>part.type==="text").map((part:{text:string})=>part.text).join("").trim()===marker;
 assert.ok(report.markerVerified&&report.nativeSelected&&report.processStarted&&report.processClosed);
 assert.ok(report.toolReads>=1);assert.equal(report.toolErrors,0);assert.equal(report.launches,1);
 report.projectClean=git(project,"rev-parse","HEAD")===revision&&git(project,"status","--porcelain=v1")==="";
 assert.ok(report.projectClean&&report.readOnly);
 for(const shutdown of events.get("session_shutdown")??[])await shutdown({},context);
 report.stage="complete";report.status="PASS_REAL_EXPLORER_BOUNDED_ONLY";
}catch{/* No incluir prompts ni errores del proveedor. */}
finally{
 if(identity&&agents)await agents.cancelSession(identity).catch(()=>{});
 if(settled||!report.processStarted||report.processClosed)rmSync(base,{recursive:true,force:true});
 else report.status="BLOCKED";
 mkdirSync(dirname(resolve(output)),{recursive:true,mode:0o700});
 writeFileSync(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify(report));
}
if(report.status!=="PASS_REAL_EXPLORER_BOUNDED_ONLY")process.exitCode=1;
