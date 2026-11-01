import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {BackgroundJobJournal} from "../src/runtime/background-job-journal.js";

function host(){
 const events=new Map<string,Function[]>(),commands=new Map<string,any>(),tools=new Map<string,any>(),messages:any[]=[];
 const pi={on(name:string,handler:Function){events.set(name,[...(events.get(name)??[]),handler]);},registerCommand(name:string,value:any){commands.set(name,value);},registerTool(value:any){tools.set(value.name,value);},getCommands(){return[];},getAllTools(){return[];},sendMessage(message:any,options:any){messages.push({message,options});}};
 return {pi,events,commands,tools,messages};
}

test("public background tool runs one real child, delivers an untrusted terminal result, and does not replay after restart",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-background-delivery-e2e-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const previous=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";t.after(()=>{if(previous===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=previous;});
 let childStarts=0;
 const backgroundExecutor=(command:string,cwd:string,{onData,signal}:any)=>new Promise<{exitCode:number|null}>((resolve,reject)=>{
  assert.equal(command,"integration child");assert.equal(cwd,process.cwd());childStarts++;
  const child=spawn(process.execPath,["-e","process.stdout.write('integration output\\n')"],{cwd,stdio:["ignore","pipe","pipe"],windowsHide:true,signal});
  child.stdout.on("data",onData);child.stderr.on("data",onData);child.once("error",reject);child.once("close",code=>resolve({exitCode:code}));
 });
 const create=()=>host(),first=create();
 // Pi can only receive a terminal result after its journal entry is durable.
 const originalSend=first.pi.sendMessage;
 first.pi.sendMessage=(message:any,options:any)=>{
  const durable=new BackgroundJobJournal(path.join(root,"jobs.json")).load("integration-session",process.cwd())[0];
  assert.equal(durable?.state,"completed");
  assert.equal(durable?.deliveryState,"pending","persist pending before Pi enqueue");
  originalSend(message,options);
 };
 const dependencies={homeDir:()=>root,backgroundJobJournalFile:path.join(root,"jobs.json"),backgroundExecutor,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false};
 createAsenExtension(dependencies)(first.pi as any);
 const widgets:Array<{key:string;lines:string[]|undefined}>=[];
 const context={mode:"rpc",hasUI:true,cwd:process.cwd(),sessionManager:{getSessionId:()=>"integration-session"},ui:{notify(){},confirm:async()=>true,setWidget(key:string,lines:string[]|undefined){widgets.push({key,lines});}}};
 await first.events.get("session_start")![0]!({},context);
 const started=await first.tools.get("asen_background_start").execute("start",{command:"integration child"},new AbortController().signal,()=>{},context);
 const job=started.details as {id:string;sessionId:string;state:string};assert.equal(job.sessionId,"integration-session");assert.equal(job.state,"running");
 const deadline=Date.now()+5_000;while(first.messages.length===0&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(childStarts,1);assert.equal(first.messages.length,1);
 const delivered=first.messages[0]!;assert.equal(delivered.message.customType,"asen.background.result");assert.equal(delivered.options.triggerTurn,false);assert.equal(delivered.message.details.trusted,false);assert.equal(delivered.message.details.state,"completed");assert.equal(delivered.message.details.deliveryState,"enqueued");assert.equal(delivered.message.details.deliveryConfirmed,false);assert.match(delivered.message.content,/integration output/u);
 const widgetDeadline=Date.now()+5_000;while(!widgets.some(entry=>entry.key==="asen-notifications"&&entry.lines?.join("\n").includes("ASEN outcomes"))&&Date.now()<widgetDeadline)await new Promise(resolve=>setTimeout(resolve,10));
 assert.ok(widgets.some(entry=>entry.key==="asen-notifications"&&entry.lines?.join("\n").includes("ASEN outcomes")),"observed job completion must project to the Pi widget");
 assert.ok(widgets.some(entry=>entry.lines?.join("\n").includes("Succeeded")),"the widget must show only the public job status");
 const current=await first.tools.get("asen_background_status").execute("status",{},new AbortController().signal,()=>{},context);
 assert.equal(current.details[0].deliveryState,"enqueued");
 await first.events.get("session_shutdown")![0]!({},context);
 assert.equal(widgets.filter(entry=>entry.key==="asen-notifications").at(-1)?.lines,undefined,"shutdown must clear ephemeral notifications");

 const restarted=create();createAsenExtension(dependencies)(restarted.pi as any);await restarted.events.get("session_start")![0]!({},context);
 assert.equal(childStarts,1,"restart must never execute the retained command again");assert.equal(restarted.messages.length,0,"Pi's enqueue API has no durable delivery acknowledgement, so recovery must not replay stale output");
 const recovered=await restarted.tools.get("asen_background_status").execute("status-after-restart",{},new AbortController().signal,()=>{},context);
 assert.equal(recovered.details.length,1);assert.equal(recovered.details[0].id,job.id);assert.equal(recovered.details[0].state,"completed");assert.equal(recovered.details[0].deliveryState,"enqueued");
 await restarted.events.get("session_shutdown")![0]!({},context);
});

test("a failed real child leaves a durable pending notice and startup retries it once with the same event id",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-background-pending-recovery-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const previous=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";t.after(()=>{if(previous===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=previous;});
 let childStarts=0;
 const backgroundExecutor=(command:string,cwd:string,{onData,signal}:any)=>new Promise<{exitCode:number|null}>((resolve,reject)=>{
  assert.equal(command,"integration failure");childStarts++;
  const child=spawn(process.execPath,["-e","process.stderr.write('expected failure\\n');process.exit(7)"],{cwd,stdio:["ignore","pipe","pipe"],windowsHide:true,signal});
  child.stdout.on("data",onData);child.stderr.on("data",onData);child.once("error",reject);child.once("close",code=>resolve({exitCode:code}));
 });
 const dependencies={homeDir:()=>root,backgroundJobJournalFile:path.join(root,"jobs.json"),backgroundExecutor,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false};
 const context={mode:"rpc",hasUI:true,cwd:process.cwd(),sessionManager:{getSessionId:()=>"recovery-session"},ui:{notify(){},confirm:async()=>true,setWidget(){}}};
 const first=host();first.pi.sendMessage=()=>{throw new Error("synthetic delivery fault");};createAsenExtension(dependencies)(first.pi as any);await first.events.get("session_start")![0]!({},context);
 const started=await first.tools.get("asen_background_start").execute("start",{command:"integration failure"},new AbortController().signal,()=>{},context),job=started.details as {id:string};
 const deadline=Date.now()+5_000;while(childStarts<1&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
 let retained=await first.tools.get("asen_background_status").execute("status",{},new AbortController().signal,()=>{},context),deadlineState=Date.now()+5_000;
 while((retained.details[0]?.state!=="failed"||retained.details[0]?.deliveryState!=="pending")&&Date.now()<deadlineState){await new Promise(resolve=>setTimeout(resolve,10));retained=await first.tools.get("asen_background_status").execute("status",{},new AbortController().signal,()=>{},context);}
 assert.equal(retained.details[0].state,"failed");assert.equal(retained.details[0].exitCode,7);assert.equal(retained.details[0].deliveryState,"pending");assert.match(retained.details[0].deliveryError,/synthetic delivery fault/u);
 await first.events.get("session_shutdown")![0]!({},context);
 const restarted=host();createAsenExtension(dependencies)(restarted.pi as any);await restarted.events.get("session_start")![0]!({},context);
 assert.equal(childStarts,1,"recovery must never repeat the failed command");assert.equal(restarted.messages.length,1);
 const message=restarted.messages[0]!.message;assert.equal(message.details.jobId,job.id);assert.equal(message.details.state,"failed");assert.equal(message.details.exitCode,7);assert.equal(message.details.deliveryConfirmed,false);assert.match(message.content,/exit code 7/u);assert.match(message.content,/no hay confirmación durable de que se mostrara/u);
 await restarted.events.get("session_shutdown")![0]!({},context);
 const third=host();createAsenExtension(dependencies)(third.pi as any);await third.events.get("session_start")![0]!({},context);
 assert.equal(third.messages.length,0,"an accepted enqueue must not be replayed after restart");
 await third.events.get("session_shutdown")![0]!({},context);
});

test("startup reports uncertain interrupted jobs but cannot replay or mark a still-running disk entry as enqueued",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-uncertain-startup-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const journalPath=path.join(root,"jobs.json"),journal=new BackgroundJobJournal(journalPath);
 const sessionId="uncertain-session",projectId=process.cwd(),now=new Date().toISOString();
 journal.record({id:"uncertain-1",sessionId,projectId,command:"must never run automatically",mode:"background",state:"running",createdAt:now,updatedAt:now,exitCode:null,eventCount:0,tail:[]});
 const diskBefore=journal.load(sessionId,projectId);assert.equal(diskBefore[0]?.state,"interrupted");
 const prior=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";
 t.after(()=>{if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;});
 let starts=0;
 const dependencies={homeDir:()=>root,backgroundJobJournalFile:journalPath,backgroundExecutor:async()=>{starts++;return{exitCode:0};},enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false};
 const notices:string[]=[];
 const context={mode:"rpc",hasUI:true,cwd:projectId,sessionManager:{getSessionId:()=>sessionId},ui:{notify(message:string){notices.push(message);},confirm:async()=>true,setWidget(){}}};
 for(let restart=0;restart<2;restart++){
  const instance=host();createAsenExtension(dependencies)(instance.pi as any);
  await instance.events.get("session_start")![0]!({},context);
  assert.equal(instance.messages.length,0,"uncertain operation must not be falsely delivered, even after repeated restarts");
  assert.equal(starts,0,"interruption must never re-execute an unapproved child");
  assert.ok(notices.some(message=>message.includes("resultado incierto")&&message.includes("asen_background_status")),"startup must warn without claiming delivery");
  const status=await instance.tools.get("asen_background_status").execute("uncertain-status",{},new AbortController().signal,()=>{},context);
  assert.equal(status.details[0]?.state,"interrupted");
  assert.equal(status.details[0]?.deliveryState,undefined);
  await instance.events.get("session_shutdown")![0]!({},context);
 }
 // The original disk identity is retained as running, not silently rewritten to
 // a terminal result or to an enqueue receipt without explicit ownership fencing.
 assert.equal(journal.load(sessionId,projectId)[0]?.state,"interrupted");
 assert.throws(()=>journal.updateDeliveryState("uncertain-1",sessionId,projectId,"enqueued"),/Cannot deliver a running job result/u);
});


test("a losing process cannot send or acknowledge an unpersisted terminal outcome",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-background-stale-terminal-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const before=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";t.after(()=>{if(before===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=before;});
 const file=path.join(root,"jobs.json"),journal=new BackgroundJobJournal(file),sessionId="stale-terminal-session",projectId=process.cwd();
 let finish!: (outcome:{exitCode:number|null})=>void;
 const backgroundExecutor=()=>new Promise<{exitCode:number|null}>(resolve=>{finish=resolve;});
 const dependencies={homeDir:()=>root,backgroundJobJournalFile:file,backgroundExecutor,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false};
 const notices:string[]=[],context={mode:"rpc",hasUI:true,cwd:projectId,sessionManager:{getSessionId:()=>sessionId},ui:{notify(message:string){notices.push(message);},confirm:async()=>true,setWidget(){}}};
 const first=host();createAsenExtension(dependencies)(first.pi as any);await first.events.get("session_start")![0]!({},context);
 const started=await first.tools.get("asen_background_start").execute("start",{command:"synthetic journal race"},new AbortController().signal,()=>{},context),job=started.details as {id:string};
 const disk=journal.load(sessionId,projectId)[0]!;
 journal.record({...disk,state:"failed",exitCode:9,updatedAt:new Date(Date.now()+1000).toISOString(),tail:["other process outcome"]});
 journal.updateDeliveryState(job.id,sessionId,projectId,"enqueued");
 finish({exitCode:0});
 const deadline=Date.now()+5000;let observed:any;
 do{observed=await first.tools.get("asen_background_status").execute("status",{},new AbortController().signal,()=>{},context);if(observed.details[0]?.persistenceError)break;await new Promise(resolve=>setTimeout(resolve,10));}while(Date.now()<deadline);
 assert.match(observed.details[0]?.persistenceError??"",/could not persist the terminal result/u);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(first.messages.length,0,"never enqueue a terminal result that lost its durable record");
 assert.ok(notices.some(message=>message.includes("no pudo guardar el resultado")),"user gets a scoped diagnostic, not a false success");
 const durable=journal.load(sessionId,projectId)[0]!;assert.equal(durable.state,"failed");assert.equal(durable.exitCode,9);assert.equal(durable.deliveryState,"enqueued");
 await first.events.get("session_shutdown")![0]!({},context);
 const restarted=host();createAsenExtension(dependencies)(restarted.pi as any);await restarted.events.get("session_start")![0]!({},context);
 assert.equal(restarted.messages.length,0,"stale completion never turns into a restart replay");
 await restarted.events.get("session_shutdown")![0]!({},context);
});
