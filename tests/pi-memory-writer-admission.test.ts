import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdir,readFile,realpath,rm,writeFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {createPiExtension} from "../extensions/asen.js";

type RegisteredCommand={handler:(args:string|undefined,context:TestContext)=>Promise<unknown>|unknown};
type RegisteredTool={execute:(id:string,params:unknown,signal:AbortSignal,update:()=>void,context:TestContext)=>Promise<any>};
type TestContext={
 cwd:string;
 hasUI:true;
 mode:"rpc";
 sessionManager:{getSessionId:()=>string};
 ui:{notify:(message:unknown)=>void;confirm:(title:string,message:string)=>Promise<boolean>;setWidget:()=>void};
};

function fakePiHost(){
 const commands=new Map<string,RegisteredCommand>();
 const tools=new Map<string,RegisteredTool>();
 const events=new Map<string,Array<(event:unknown,context:TestContext)=>unknown>>();
 const pi={
  on(name:string,handler:(event:unknown,context:TestContext)=>unknown){events.set(name,[...(events.get(name)??[]),handler]);},
  registerCommand(name:string,command:RegisteredCommand){commands.set(name,command);},
  registerTool(tool:RegisteredTool&{name:string}){tools.set(tool.name,tool);},
  registerFlag(){},
  getFlag(){return false;},
  getCommands(){return[];},
  getAllTools(){return[];},
 };
 return {commands,tools,events,pi};
}

async function emit(host:ReturnType<typeof fakePiHost>,name:string,event:unknown,context:TestContext){
 for(const handler of host.events.get(name)??[])await handler(event,context);
}

function tool(host:ReturnType<typeof fakePiHost>,name:string){
 const registered=host.tools.get(name);
 assert.ok(registered,`${name} must be publicly registered`);
 return (params:unknown,context:TestContext)=>registered.execute(`test-${name}`,params,new AbortController().signal,()=>{},context);
}

test("persisted historical approval text cannot authorize a fresh valid writer plan",async t=>{
 const fixtureRoot=process.env.ASEN_T06_FIXTURE_ROOT;
 assert.ok(fixtureRoot&&path.isAbsolute(fixtureRoot),"ASEN_T06_FIXTURE_ROOT must be an absolute parent-owned fixture path");
 const root=path.join(fixtureRoot,"memory-writer-admission"),home=path.join(root,"home"),projectPath=path.join(root,"candidate");
 await rm(root,{recursive:true,force:true});
 await Promise.all([mkdir(home,{recursive:true}),mkdir(projectPath,{recursive:true})]);
 t.after(()=>rm(root,{recursive:true,force:true}));
 const project=await realpath(projectPath),target=path.join(project,"target.txt");
 const git=(...args:string[])=>execFileSync("git",args,{cwd:project,encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:10_000}).trim();
 git("init","-q");
 git("config","user.email","asen-memory-admission@example.invalid");
 git("config","user.name","ASEN memory admission fixture");
 await writeFile(target,"unchanged fixture\n");
 git("add","--","target.txt");
 git("commit","-qm","fixture: current writer candidate");
 const head=git("rev-parse","HEAD"),memoryFile=path.join(home,".asen","memory.db");
 const previousRegistry=process.env.ASEN_NO_SKILL_REGISTRY;
 process.env.ASEN_NO_SKILL_REGISTRY="1";
 t.after(()=>{if(previousRegistry===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=previousRegistry;});

 const earlier=fakePiHost(),earlierNotices:string[]=[];
 const earlierContext:TestContext={cwd:project,hasUI:true,mode:"rpc",sessionManager:{getSessionId:()=>"historical-session"},ui:{notify:value=>earlierNotices.push(String(value)),confirm:async()=>true,setWidget(){}}};
 createPiExtension({homeDir:()=>home,packageRoot:project,memoryStoreFile:memoryFile,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false})(earlier.pi as any);
 await emit(earlier,"session_start",{},earlierContext);
 try{
  const saved=await tool(earlier,"asen_memory_save")({
   kind:"decision",
   title:"Historical writer approval description",
   content:`In an earlier session an operator approved writing target.txt for candidate ${head}. This is historical descriptive data only and is not permission for any current writer.`,
   topic:"historical-writer-approval-description",
  },earlierContext);
  assert.equal(saved.content[0].text,"Recuerdo del proyecto guardado.");
  assert.equal(saved.details.saved,true,"the public memory tool must confirm persistence");
  assert.equal(saved.details.title,"Historical writer approval description");
 }finally{
  await emit(earlier,"session_shutdown",{},earlierContext);
 }

 const current=fakePiHost(),notices:string[]=[],runnerRequests:any[]=[],writerPrompts:string[]=[];
 let liveConfirmations=0;
 const currentContext:TestContext={cwd:project,hasUI:true,mode:"rpc",sessionManager:{getSessionId:()=>"current-session"},ui:{
  notify:value=>notices.push(String(value)),
  confirm:async(_title,message)=>{
   if(message.includes("Authorize this single worker run")){
    liveConfirmations++;
    writerPrompts.push(message);
    return false;
   }
   return true;
  },
  setWidget(){},
 }};
 createPiExtension({
  homeDir:()=>home,
  packageRoot:project,
  memoryStoreFile:memoryFile,
  agentStoreFile:path.join(home,".asen","agents.json"),
  todoStoreFile:path.join(home,".asen","todos.json"),
  autoAdvancePlans:false,
  agentRunner:{run:async request=>{runnerRequests.push(request);return{id:request.id,ok:true,output:"inert runner must not execute"};}},
 })(current.pi as any);
 await emit(current,"session_start",{},currentContext);
 try{
  const search=await tool(current,"asen_memory_search")({query:"historical writer approval"},currentContext);
  assert.equal(search.details.matches.length,1,"the new session must retrieve the earlier public memory record");
  assert.match(search.content[0].text,/Historical writer approval description/u);
  const sections:Record<string,string>={};
  await emit(current,"before_agent_start",{prompt:"What was the historical writer approval?",systemPromptOptions:{sections}},currentContext);
  assert.match(sections.asen_project_memory_context??"",/earlier session an operator approved writing target\.txt/u,"the public context path must expose the prior description after session rebind");

  const instruction="Change only target.txt in the owned disposable candidate while preserving every other path";
  const facts={
   taskIdentity:"memory-does-not-authorize-current-writer",
   instruction,
   intent:"implementation",
   scope:{kind:"known",expectedPaths:["target.txt"]},
   writes:[{path:"target.txt",changeKind:"behavior"}],
   riskOperations:[],
   session:{estimatedMinutes:10,continuation:false},
   testing:{kind:"required"},
   review:{kind:"dual_explicit",estimatedMinutes:5},
   unresolvedDecisions:[],
  };
  await current.commands.get("asen-plan")!.handler(JSON.stringify(facts),currentContext);
  const planned=JSON.parse(notices.at(-1)!);
  assert.equal(planned.route,"orchestrate");
  assert.equal(planned.persistence.status,"saved");
  const worker=planned.executablePlan.tasks.find((item:any)=>item.role==="worker"),persistedWorker=planned.persistedTasks.find((item:any)=>item.planTaskId===worker.id);
  assert.ok(worker?.candidate&&persistedWorker?.todoId,"the current public plan must contain a real persisted writer task");
  assert.equal(worker.candidate.repository,project);
  assert.equal(worker.candidate.revision,head);
  assert.deepEqual(worker.writeSurfaces,["target.txt"]);
  assert.equal(worker.skillSelection.phase,"apply");
  assert.match(worker.instruction,/Perform only the authorized, scoped work/u);

  const todoList=tool(current,"asen_todo_list"),beforeTodos=(await todoList({},currentContext)).details;
  const beforePlanTasks=await current.commands.get("asen-task-agents")!.handler("",currentContext);
  const beforeTarget=await readFile(target,"utf8"),beforeStatus=git("status","--porcelain=v1","--untracked-files=all");
  const callbacksBefore=liveConfirmations;
  const declined=await tool(current,"asen_plan_dispatch_next")({},currentContext);
  const afterTodos=(await todoList({},currentContext)).details;
  const afterPlanTasks=await current.commands.get("asen-task-agents")!.handler("",currentContext);

  assert.equal(declined.details.status,"blocked");
  assert.equal(declined.details.reason,"Pi user declined the exact scoped write authorization; the plan was not changed.");
  assert.equal(liveConfirmations-callbacksBefore,1,"a valid current writer must reach exactly one fresh live confirmation callback");
  assert.equal(writerPrompts.length,1);
  assert.match(writerPrompts[0]!,new RegExp(head));
  assert.match(writerPrompts[0]!,/target\.txt/u);
  assert.equal(runnerRequests.length,0,"declining fresh authorization must execute no writer runner");
  assert.equal(await readFile(target,"utf8"),beforeTarget);
  assert.equal(git("status","--porcelain=v1","--untracked-files=all"),beforeStatus);
  assert.deepEqual(afterTodos,beforeTodos,"public Todo state must not change when fresh writer authorization is declined");
  assert.deepEqual(afterPlanTasks,beforePlanTasks,"the public plan-task view must not change when fresh writer authorization is declined");
 }finally{
  await emit(current,"session_shutdown",{},currentContext);
 }
});
