import assert from "node:assert/strict";
import test from "node:test";
import {mkdir,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync,spawnSync} from "node:child_process";
import {createPiExtension} from "../extensions/asen.js";
import {PersistentAgentStore} from "../src/runtime/agent-store.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
import {selectSkills} from "../src/skills/registry.js";

/**
 * ECO-06 crash boundary: the worker has already modified a real file when
 * its process disappears. Reopening the durable queue must never replay it.
 * A new write requires an independently authorized fresh dispatch.
 */
test("ECO-06 interrupted writer preserves partial edits but cannot replay authority",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-eco06-writer-crash-"));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,"agents.json"),target=join(dir,"work.txt");
 await writeFile(target,"before\n");
 const child=spawnSync(process.execPath,["--import","tsx","--input-type=module","-e",`
  import {PersistentAgentStore} from "./src/runtime/agent-store.ts";
  import {appendFile} from "node:fs/promises";
  const file=process.argv[1],target=process.argv[2];
  const {store}=await PersistentAgentStore.open(file);
  const request={id:"interrupted-writer",role:"worker",prompt:"Edit only work.txt",repository:"/repo",isolationKey:"session-a",
    candidate:{id:"candidate",repository:"/repo",revision:"revision"},writeSurfaces:["work.txt"],
    writerAdmission:{opaque:true}};
  await store.enqueueControlledWorker(request,{kind:"user",id:"pi:session-a"});
  await store.running("interrupted-writer",new Date().toISOString());
  await appendFile(target,"partially-applied\\n");
 `,file,target],{encoding:"utf8",timeout:30000,cwd:process.cwd()});
 assert.equal(child.status,0,`crash fixture failed: ${child.stderr}`);
 const before=await readFile(target,"utf8");
 assert.equal(before,"before\npartially-applied\n");
 const reopened=await PersistentAgentStore.open(file);
 const entry=await reopened.store.get("interrupted-writer","session-a","/repo");
 assert.equal(entry?.record.state,"interrupted");
 assert.equal(entry?.result,undefined);
 assert.equal(await reopened.store.get("interrupted-writer","other-session","/repo"),undefined);
 assert.equal(await reopened.store.get("interrupted-writer","session-a","/other-repo"),undefined);
 assert.equal((await reopened.store.list("other-session","/repo")).length,0);
 assert.equal((await reopened.store.list("session-a","/other-repo")).length,0);
 await assert.rejects(
  ()=>reopened.store.enqueueContinuation("interrupted-writer","other-session","/repo",{kind:"user",id:"pi:other-session"}),
  /unavailable to this session or project/
 );
 await assert.rejects(
  ()=>reopened.store.enqueueContinuation("interrupted-writer","session-a","/other-repo",{kind:"user",id:"pi:session-a"}),
  /unavailable to this session or project/
 );
 for(const field of ["candidate","writeSurfaces","writerAdmission","phaseGrant"]){
  assert.equal(Object.hasOwn(entry?.request??{},field),false,`${field} must not be restored`);
 }
 assert.equal(reopened.store.resumable(entry!),undefined);
 await assert.rejects(
  ()=>reopened.store.enqueueContinuation("interrupted-writer","session-a","/repo",{kind:"user",id:"pi:session-a"}),
  /cannot be resumed safely|fresh authority/
 );
 assert.equal(await readFile(target,"utf8"),before,"restart must not reapply partial edits");
 assert.equal((await reopened.store.list("session-a","/repo")).length,1,"no second execution admitted");
 const reopenedAgain=await PersistentAgentStore.open(file);
 assert.equal((await reopenedAgain.store.get("interrupted-writer","session-a","/repo"))?.record.state,"interrupted");
 assert.equal((await reopenedAgain.store.list("session-a","/repo")).length,1);
 await assert.rejects(()=>reopenedAgain.store.enqueue({id:"unauthorized-replay",role:"worker",prompt:"Edit again",repository:"/repo",isolationKey:"session-a",writeSurfaces:["work.txt"]},{kind:"user",id:"pi:session-a"}),/Authority-bearing agent requests cannot be serialized/);
 assert.equal(await readFile(target,"utf8"),before);
});

test("ECO-06 Pi inspection binds the interrupted writer to its blocked Todo and current Git diff",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-eco06-pi-inspection-")),home=join(root,"home"),project=join(root,"project");
 t.after(()=>rm(root,{recursive:true,force:true}));await Promise.all([mkdir(home,{recursive:true}),mkdir(project,{recursive:true})]);
 const git=(...args:string[])=>execFileSync("git",args,{cwd:project,encoding:"utf8",stdio:["ignore","pipe","pipe"]});
 git("init","-q");git("config","user.email","asen-test@example.invalid");git("config","user.name","ASEN test");
 await writeFile(join(project,"target.txt"),"before\n");await writeFile(join(project,"outside.txt"),"stable\n");git("add","target.txt","outside.txt");git("commit","-qm","clean candidate");
 const revision=git("rev-parse","HEAD").trim(),identity={sessionId:"eco06-pi-inspection-session",projectId:project},candidate={id:"eco06-fixture-candidate",repository:project,revision,createdAt:new Date().toISOString()},agentId="eco06-pi-inspection:worker",todoFile=join(home,".asen","todos.json"),agentFile=join(home,".asen","agents.json"),linkFile=join(home,".asen","task-agent-links.json");
 await writeFile(join(project,"target.txt"),"before\npartial PRIVATE-CONTENT\n");await writeFile(join(project,"outside.txt"),"unexpected outside edit\n");
 const selection={phase:"apply" as const,risk:"medium" as const,codeChange:true,behaviorChange:true,filesTouched:2},skillPaths=selectSkills(selection).map(skill=>skill.path),todos=await SessionTodoStore.open(todoFile),[todo]=await todos.addPlan([{title:"Recover partial fixture write",requestId:"asen-plan:eco06-pi-inspection:worker",dependsOn:[],description:"Update the two scoped fixture files",plan:{role:"worker",skillPaths,skillSelection:selection,candidate,writeSurfaces:["target.txt","new-target.txt"],writerAuthorizationBasis:JSON.stringify({instruction:"Update the two scoped fixture files"})}}],identity);
 await todos.update(todo!.taskId,identity,1,"running");await todos.recover(identity);
 const {store:agentStore}=await PersistentAgentStore.open(agentFile),agentRequest={id:agentId,role:"worker" as const,prompt:"Update only the two approved fixture files",repository:project,isolationKey:identity.sessionId,candidate,writeSurfaces:["target.txt","new-target.txt"],writerAdmission:{oneUse:true}};
 await agentStore.enqueueControlledWorker(agentRequest,{kind:"user",id:`pi:${identity.sessionId}`});await agentStore.running(agentId,new Date().toISOString());
 // Simulate a recovered journal without process ownership; restart must quarantine its running writer.
 const agentJournal=JSON.parse(await readFile(agentFile,"utf8"));delete agentJournal.entries[0].request.ownerProcessId;await writeFile(agentFile,`${JSON.stringify(agentJournal,null,2)}\n`);
 // Windows can persist a different but equivalent casing for the same workspace path.
 const linkedProject=process.platform==="win32"?project.toUpperCase():project;
 await new TaskAgentLinkStore(linkFile).bind({taskId:todo!.taskId,agentId,sessionId:identity.sessionId,projectId:linkedProject,createdAt:new Date().toISOString()});
 const events=new Map<string,Function[]>(),tools=new Map<string,any>();const pi={on:(name:string,handler:Function)=>events.set(name,[...(events.get(name)??[]),handler]),registerCommand:()=>{},registerTool:(tool:any)=>tools.set(tool.name,tool),getCommands:()=>[],getAllTools:()=>[]};
 const context=(sessionId=identity.sessionId,cwd=project)=>({mode:"rpc",hasUI:true,cwd,sessionManager:{getSessionId:()=>sessionId},ui:{notify:()=>{},confirm:async()=>true,setWidget:()=>{}}});
 const priorRegistry=process.env.ASEN_NO_SKILL_REGISTRY;t.after(()=>{if(priorRegistry===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=priorRegistry;});process.env.ASEN_NO_SKILL_REGISTRY="1";
 createPiExtension({homeDir:()=>home,agentStoreFile:agentFile,todoStoreFile:todoFile,enableMemoryRuntime:false,enableWorkspaceRuntime:false,agentRunner:{run:async()=>{throw new Error("Interrupted writer must never be replayed during inspection");}}})(pi as any);
 await events.get("session_start")![0]!({},context());
 const result=await tools.get("asen_todo_inspect_interrupted_write").execute("inspect-partial-writer",{agentId},new AbortController().signal,()=>{},context());
 assert.equal(result.details.task.state,"blocked");assert.equal(result.details.agent.state,"interrupted");assert.deepEqual(result.details.candidate,{expectedRevision:revision,observedHead:revision,matches:true});
 assert.equal(result.details.repository.clean,false);assert.equal(result.details.recovery.automaticWriteAllowed,false);assert.equal(result.details.recovery.freshAuthorizationRequired,true);assert.equal(result.details.recovery.eligibleForFreshPlan,false);
 assert.deepEqual(result.details.changes.map((item:any)=>[item.path,item.scope]),[["outside.txt","outside"],["target.txt","approved"]]);assert.equal(JSON.stringify(result.details).includes("PRIVATE-CONTENT"),false);
 assert.equal(await readFile(join(project,"target.txt"),"utf8"),"before\npartial PRIVATE-CONTENT\n");assert.equal((await todos.list(identity)).length,1);assert.equal((await todos.list(identity))[0]?.current.state,"blocked");
 await assert.rejects(()=>tools.get("asen_todo_inspect_interrupted_write").execute("wrong-session",{agentId},new AbortController().signal,()=>{},context("foreign-session")),/Only an interrupted writer owned by this exact Pi session and project/u);
 await events.get("session_shutdown")![0]!({},context());
});
