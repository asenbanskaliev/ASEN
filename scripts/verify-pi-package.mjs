import assert from "node:assert/strict";
import {mkdirSync,mkdtempSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {DefaultResourceLoader,SettingsManager} from "@earendil-works/pi-coding-agent";
import {createPiVerifierEnvironment} from "./gsp06-pi-free-environment.mjs";
import {settleVerifierChild} from "./pi-verifier-exit.mjs";

// Run in a separate process: no credentials, models, user homes or ambient indexes.
if(!process.argv[2])throw new Error("Usage: node scripts/verify-pi-package.mjs <installed-package-root> [pi-cli-path]");
const packageRoot=path.resolve(process.argv[2]);
const root=mkdtempSync(path.join(tmpdir(),"asen-installed-pi-"));
try {
  process.env.HOME=root;process.env.USERPROFILE=root;
  process.env.PI_CODING_AGENT_DIR=path.join(root,"agent");
  process.env.ASEN_NO_SKILL_REGISTRY="1";
  delete process.env.ASEN_PI_AUTHORITY;
  const loader=new DefaultResourceLoader({cwd:root,agentDir:process.env.PI_CODING_AGENT_DIR,
    settingsManager:SettingsManager.inMemory({packages:[packageRoot]}),
    noSkills:true,noThemes:true,noPromptTemplates:true,noContextFiles:true,
    disabledBuiltinExtensions:["mcp","llama.cpp"]});
  await loader.reload();
  const loaded=loader.getExtensions();
  assert.deepEqual(loaded.errors,[]);
  assert.deepEqual(loaded.extensions.map(e=>path.basename(e.path)),["asen.ts"],"installed primary must exclude child authority");
  assert.equal(loaded.extensions.some(e=>e.handlers.has("tool_call")),false,"primary install must not inherit child tool denial");
  assert.ok(loaded.extensions[0].handlers.has("session_start"),"public preflight must wait for initialized host context");
  assert.equal(loaded.extensions[0].commands.size,0,"commands must not register before collision inventories are initialized");
  const defaultPiCli=path.join(path.dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))),"bundle","cli.js");
  const cli=process.argv[3]?path.resolve(process.argv[3]):defaultPiCli;
  const primary=path.join(packageRoot,"extensions","asen.ts"),probe=path.join(root,"public-host-probe.ts");
  const sessionId="asen-package-reopen-session",projectId=realpathSync(root),asenHome=path.join(root,".asen"),stamp="2026-10-10T00:00:00.000Z";
  mkdirSync(asenHome,{recursive:true,mode:0o700});
  const todoId="todo-package-reopen",foreignTodoId="todo-package-foreign";
  const agentId="agent-package-interrupted";
  const todoEvent=(taskId,session,state,revision,at,reason)=>({taskId,sessionId:session,projectId,revision,state,at,...(reason?{reason}:{})});
  writeFileSync(path.join(asenHome,"todos.json"),JSON.stringify({schema:"asen.todo/v1",revision:1,items:[
    {taskId:todoId,title:"Pi restart recovery",events:[todoEvent(todoId,sessionId,"planned",1,stamp),todoEvent(todoId,sessionId,"running",2,stamp)]},
    {taskId:foreignTodoId,title:"Foreign session task",events:[todoEvent(foreignTodoId,"asen-package-foreign-session","planned",1,stamp)]}
  ]}),{mode:0o600});
  const interruptedReason="Interrupted; explicit review is required before continuing";
  writeFileSync(path.join(asenHome,"agents.json"),JSON.stringify({schema:"asen.agents/v1",revision:1,entries:[{
    record:{id:agentId,role:"explorer",owner:{kind:"user",id:`pi:${sessionId}`},sessionId,projectId,state:"interrupted",createdAt:stamp,updatedAt:stamp,summary:interruptedReason},
    request:{id:agentId,role:"explorer",prompt:"Inspect the project without changing files",repository:projectId,isolationKey:sessionId,createdAt:stamp},
    events:[
      {id:agentId,revision:1,state:"queued",at:stamp},
      {id:agentId,revision:2,state:"running",at:stamp},
      {id:agentId,revision:3,state:"interrupted",at:stamp,summary:interruptedReason}
    ]
  }]}),{mode:0o600});
  writeFileSync(path.join(asenHome,"task-agent-links.json"),JSON.stringify({schema:"asen.task-agent-links/v1",revision:1,links:[{
    taskId:todoId,agentId,sessionId,projectId,createdAt:stamp
  }]}),{mode:0o600});
  const workspaceChange=(session,path,actor)=>({path,actor:{kind:"user",id:actor},sessionId:session,projectId,worktree:projectId,operation:"modify",at:stamp});
  const assertInterruptedAgentVisible=message=>{
    assert.ok(message.includes(agentId),`restored agent identity must be visible: ${message}`);
    assert.ok(message.includes("interrupted"),`restored agent state must be visible: ${message}`);
    assert.ok(message.includes("explicit review"),`interrupted work must require review before continuation: ${message}`);
  };
  writeFileSync(path.join(asenHome,"workspace.json"),JSON.stringify({schema:"asen.workspace/v1",revision:2,changes:[
    {revision:1,id:"change-package-owned",change:workspaceChange(sessionId,"src/owned.ts","user-owned")},
    {revision:2,id:"change-package-foreign",change:workspaceChange("asen-package-foreign-session","src/foreign.ts","user-foreign")}
  ]}),{mode:0o600});
  writeFileSync(probe,`export default function(pi){
    pi.on("session_start",(_event,ctx)=>{
      const commands=pi.getCommands().map(row=>({name:row.name,source:row.source,path:row.sourceInfo.path}));
      const tools=pi.getAllTools().map(row=>({name:row.name,path:row.sourceInfo.path}));
      ctx.ui.notify("ASEN_PUBLIC_HOST:"+JSON.stringify({mode:ctx.mode,hasUI:ctx.hasUI,commands,tools}),"info");
    });
  }`);
  const child=spawn(process.execPath,[cli,"--mode","rpc","--session-id",sessionId,"--no-extensions","--extension",primary,"--extension",probe,"--no-skills"],{
    cwd:root,env:createPiVerifierEnvironment(process.env),stdio:["pipe","pipe","pipe"]});
  // Pi 0.85.1 decides whether to enter RPC from the first available stdin bytes.
  child.stdin.write(JSON.stringify({id:"commands",type:"get_commands"})+"\n");
  const closed=new Promise(resolve=>child.once("close",(code,signal)=>resolve({code,signal})));
  let firstVerified=false;
  let models=0,visible=0;
  const hostObservations=[];let startupRecoveryNotice="",planTasks=[];
  try{
    await new Promise((resolve,reject)=>{
      const names=["asen","asen-commands","asen-status","asen-doctor","asen-agents","asen-changes","asen-todos","asen-task-agents","asen-profiles","asen-route","asen-plan"];
      let buffer="",stdout="",stderr="",index=0,notifications=0,lastNotification="";
      const timer=setTimeout(()=>fail(Error(`Installed RPC commands timed out: ${stderr.slice(-1000)}`)),20000);
      const fail=error=>{clearTimeout(timer);reject(error);};
      const send=value=>child.stdin.write(JSON.stringify(value)+"\n");
      const routeFacts={taskIdentity:"package-route",intent:"analysis",scope:{kind:"known",expectedPaths:[]},writes:[],riskOperations:[],session:{estimatedMinutes:1,continuation:false},testing:{kind:"required"},review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[]};
      const planFacts={...routeFacts,taskIdentity:"package-plan",instruction:"Implement and verify this bounded change",intent:"implementation",scope:{kind:"known",expectedPaths:["src/a.ts","src/b.ts","src/c.ts","src/d.ts"]},writes:[{path:"src/a.ts",changeKind:"behavior"}],session:{estimatedMinutes:20,continuation:false}};
      const prompt=()=>send({id:names[index],type:"prompt",message:names[index]==="asen-route"?`/asen-route ${JSON.stringify(routeFacts)}`:names[index]==="asen-plan"?`/asen-plan ${JSON.stringify(planFacts)}`:`/${names[index]}`});
      child.once("error",fail);
      child.once("close",(code,signal)=>{if(index!==names.length)fail(Error(`Installed RPC closed before completion (code=${code}, signal=${signal}): stdout=${stdout.slice(-2000)} stderr=${stderr.slice(-1000)}`));});
      child.stderr.on("data",chunk=>{stderr=(stderr+chunk.toString()).slice(-2000);});
      child.stdout.on("data",chunk=>{
        const text=chunk.toString();stdout=(stdout+text).slice(-4000);buffer+=text;if(buffer.length>100000){fail(Error("Oversized installed RPC output"));return;}
        let newline;while((newline=buffer.indexOf("\n"))>=0){
          const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!line.trim())continue;
          try{
            const row=JSON.parse(line);
            if(row.type==="agent_start"){models++;throw Error("Installed command unexpectedly invoked a model");}
            if(row.type==="extension_ui_request"&&row.method==="notify"&&row.message.startsWith("ASEN_PUBLIC_HOST:")){
              hostObservations.push(JSON.parse(row.message.slice("ASEN_PUBLIC_HOST:".length)));
            }else if(row.type==="response"&&row.id==="commands"){
              assert.equal(row.success,true);
              for(const name of names)assert.ok(row.data.commands.some(c=>c.name===name));
              prompt();
            }else if(row.type==="extension_ui_request"&&row.method==="notify"){
              assert.equal(row.notifyType,"info");assert.ok(row.message.length>0);
              if(row.message.includes("queued or interrupted task(s)"))startupRecoveryNotice=row.message;
              else{lastNotification=row.message;notifications++;}
            }else if(row.type==="response"&&row.id===names[index]){
              assert.equal(row.success,true);assert.equal(notifications,1,`${names[index]} must be visible over RPC`);
              if(names[index]==="asen-todos")assert.match(lastNotification,/blocked.*Pi restart recovery.*explicit review is required/i);
              if(names[index]==="asen-todos")assert.ok(!lastNotification.includes(foreignTodoId),"Todo projection must exclude foreign sessions");
              if(names[index]==="asen-agents")assertInterruptedAgentVisible(lastNotification);
              if(names[index]==="asen-task-agents"){const tasks=JSON.parse(lastNotification);assert.equal(tasks[0]?.state,"blocked");assert.deepEqual(tasks[0]?.agents.map(agent=>[agent.id,agent.state]),[[agentId,"interrupted"]]);}
              if(names[index]==="asen-changes")assert.match(lastNotification,/modify\s+user:user-owned\s+src\/owned\.ts/);
              if(names[index]==="asen-changes")assert.ok(!lastNotification.includes("foreign"),"workspace projection must exclude foreign sessions");
              if(names[index]==="asen-plan"){const plan=JSON.parse(lastNotification);assert.equal(plan.route,"orchestrate");assert.equal(plan.execution.started,false);assert.equal(plan.execution.authorized,false);assert.equal(plan.actions.reviewRequested,false);assert.equal(plan.persistence.status,"saved");assert.deepEqual(plan.executablePlan.tasks.map(task=>task.role),["explorer","worker","reviewer","verifier"]);assert.equal(plan.persistedTasks.length,4);assert.deepEqual(plan.persistedTasks[1].dependsOn,[plan.persistedTasks[0].todoId]);planTasks=plan.persistedTasks;}
              visible++;index++;notifications=0;
              if(index===names.length){clearTimeout(timer);resolve();}else prompt();
            }
          }catch(error){fail(error);}
        }
      });
    });
    firstVerified=true;
  }finally{await settleVerifierChild(child,closed,{successful:firstVerified});}
  assert.equal(models,0);assert.equal(visible,11);
  assert.match(startupRecoveryNotice,/1 queued or interrupted task\(s\).*asen-agents/u);
  assert.equal(hostObservations.length,1,"public host inventories must be observed once after initialization");
  const host=hostObservations[0];
  assert.equal(host.mode,"rpc");assert.equal(typeof host.hasUI,"boolean");
  const fromPrimary=row=>realpathSync(row.path)===realpathSync(primary);
  for(const name of ["asen","asen-commands","asen-status","asen-doctor","asen-agents","asen-changes","asen-todos","asen-task-agents","asen-profiles","asen-route","asen-plan"]){
    const matches=host.commands.filter(row=>row.name===name&&row.source==="extension"&&fromPrimary(row));
    assert.equal(matches.length,1,`${name} must have one canonical installed-source registration`);
  }
  const toolNames=["asen_ask_choice","asen_ask_question","ask_user_choice","ask_user_question","asen_code_intelligence","asen_agent_start","asen_agent_status","asen_agent_cancel","asen_agent_continue","asen_todo_add","asen_todo_update","asen_todo_list","codegraph"];
  for(const name of toolNames){
    const matches=host.tools.filter(row=>row.name===name&&realpathSync(row.path)===realpathSync(primary));
    assert.equal(matches.length,1,`${name} must have one canonical installed-source registration`);
  }
  // Reopen the same durable Pi session in a fresh process and re-read both persisted projections.
  const reopened=spawn(process.execPath,[cli,"--mode","rpc","--session-id",sessionId,"--no-extensions","--extension",primary,"--no-skills"],{
    cwd:root,env:createPiVerifierEnvironment(process.env),stdio:["pipe","pipe","pipe"]});
  const reopenedClosed=new Promise(resolve=>reopened.once("close",(code,signal)=>resolve({code,signal})));
  let reopenedVerified=false;
  const seen=[];let reopenedRecoveryNotice="";
  await new Promise((resolve,reject)=>{
    const names=["asen-agents","asen-todos","asen-task-agents","asen-changes"];let buffer="",stderr="",index=-1,notifications=0,lastNotification="";
    const timer=setTimeout(()=>fail(Error(`Reopened Pi session timed out: ${stderr.slice(-1000)}`)),20000);
    const fail=error=>{clearTimeout(timer);reject(error);};
    const send=value=>reopened.stdin.write(JSON.stringify(value)+"\n");
    const requestNext=()=>{index++;if(index===names.length){clearTimeout(timer);resolve();return;}send({id:`reopen-${names[index]}`,type:"prompt",message:`/${names[index]}`});};
    reopened.once("error",fail);reopened.once("close",(code,signal)=>{if(index<names.length)fail(Error(`Pi closed during reopen verification (code=${code}, signal=${signal}): ${stderr.slice(-1000)}`));});
    reopened.stderr.on("data",chunk=>{stderr=(stderr+chunk.toString()).slice(-2000);});
    reopened.stdout.on("data",chunk=>{buffer+=chunk.toString();if(buffer.length>100000){fail(Error("Oversized reopened RPC output"));return;}let end;while((end=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;try{
      const row=JSON.parse(line);if(row.type==="agent_start")throw Error("Reopened ASEN state query invoked a model");
      if(row.type==="response"&&row.id==="reopen-commands"){assert.equal(row.success,true);for(const name of names)assert.ok(row.data.commands.some(command=>command.name===name));requestNext();}
      else if(row.type==="extension_ui_request"&&row.method==="notify"){assert.equal(row.notifyType,"info");if(row.message.includes("queued or interrupted task(s)"))reopenedRecoveryNotice=row.message;else{lastNotification=row.message;notifications++;}}
      else if(row.type==="response"&&row.id===`reopen-${names[index]}`){assert.equal(row.success,true);assert.equal(notifications,1);if(names[index]==="asen-agents")assertInterruptedAgentVisible(lastNotification);else if(names[index]==="asen-todos"){assert.match(lastNotification,/blocked.*Pi restart recovery.*explicit review is required/i);assert.ok(!lastNotification.includes(foreignTodoId));assert.match(lastNotification,/Explorer task/);}else if(names[index]==="asen-task-agents"){const tasks=JSON.parse(lastNotification),recovered=tasks.find(task=>task.taskId===todoId),workerLink=planTasks.find(task=>task.planTaskId==="package-plan:worker"),explorerLink=planTasks.find(task=>task.planTaskId==="package-plan:explorer"),worker=tasks.find(task=>task.taskId===workerLink.todoId);assert.equal(recovered?.state,"blocked");assert.deepEqual(recovered?.agents.map(agent=>[agent.id,agent.state]),[[agentId,"interrupted"]]);assert.equal(worker?.ready,false);assert.deepEqual(worker?.blockedBy,[{id:explorerLink.todoId,state:"planned"}]);}else{assert.match(lastNotification,/modify\s+user:user-owned\s+src\/owned\.ts/);assert.ok(!lastNotification.includes("foreign"));}seen.push(names[index]);notifications=0;requestNext();}
    }catch(error){fail(error);}}});
    send({id:"reopen-commands",type:"get_commands"});
  }).then(()=>{reopenedVerified=true;}).finally(()=>settleVerifierChild(reopened,reopenedClosed,{successful:reopenedVerified}));
  assert.match(reopenedRecoveryNotice,/1 queued or interrupted task\(s\).*asen-agents/u);
  assert.deepEqual(seen,["asen-agents","asen-todos","asen-task-agents","asen-changes"]);
  // Open a different real Pi session against the same project and durable stores.
  const foreign=spawn(process.execPath,[cli,"--mode","rpc","--session-id","asen-package-foreign-session","--no-extensions","--extension",primary,"--no-skills"],{
    cwd:root,env:createPiVerifierEnvironment(process.env),stdio:["pipe","pipe","pipe"]});
  const foreignClosed=new Promise(resolve=>foreign.once("close",(code,signal)=>resolve({code,signal})));
  let foreignVerified=false;
  await new Promise((resolve,reject)=>{
    const names=["asen-agents","asen-todos","asen-task-agents","asen-changes"];
    let buffer="",stderr="",index=-1,notifications=0,lastNotification="";
    const timer=setTimeout(()=>fail(Error(`Foreign Pi session timed out: ${stderr.slice(-1000)}`)),20000);
    const fail=error=>{clearTimeout(timer);reject(error);};
    const send=value=>foreign.stdin.write(JSON.stringify(value)+"\n");
    const next=()=>{index++;if(index===names.length){clearTimeout(timer);resolve();return;}send({id:`foreign-${names[index]}`,type:"prompt",message:`/${names[index]}`});};
    foreign.once("error",fail);
    foreign.once("close",(code,signal)=>{if(index<names.length)fail(Error(`Foreign Pi closed early: ${code}/${signal}`));});
    foreign.stderr.on("data",chunk=>{stderr=(stderr+chunk.toString()).slice(-2000);});
    foreign.stdout.on("data",chunk=>{
      buffer+=chunk.toString();if(buffer.length>100000){fail(Error("Oversized foreign RPC output"));return;}
      let end;while((end=buffer.indexOf("\n"))>=0){
        const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;
        try{
          const row=JSON.parse(line);if(row.type==="agent_start")throw Error("Cross-session projection invoked a model");
          if(row.type==="response"&&row.id==="foreign-commands"){
            assert.equal(row.success,true);for(const name of names)assert.ok(row.data.commands.some(command=>command.name===name));next();
          }else if(row.type==="extension_ui_request"&&row.method==="notify"){
            assert.equal(row.notifyType,"info");assert.ok(!row.message.includes(agentId));
            lastNotification=row.message;notifications++;
          }else if(row.type==="response"&&row.id===`foreign-${names[index]}`){
            assert.equal(row.success,true);assert.equal(notifications,1);
            if(names[index]==="asen-agents")assert.ok(!lastNotification.includes(agentId));
            else if(names[index]==="asen-todos"){
              assert.match(lastNotification,/Foreign session task/);assert.ok(!lastNotification.includes("Pi restart recovery"));
            }else if(names[index]==="asen-task-agents"){assert.ok(!lastNotification.includes(agentId));assert.ok(!lastNotification.includes("package-plan"));}
            else{
              assert.match(lastNotification,/modify\s+user:user-foreign\s+src\/foreign\.ts/);assert.ok(!lastNotification.includes("src/owned.ts"));
            }
            notifications=0;next();
          }
        }catch(error){fail(error);}
      }
    });
    send({id:"foreign-commands",type:"get_commands"});
  }).then(()=>{foreignVerified=true;}).finally(()=>settleVerifierChild(foreign,foreignClosed,{successful:foreignVerified}));
  console.log(JSON.stringify({installedPiPackageVerified:true,primaryExtensions:["asen.ts"],childAuthorityAutoLoaded:false,visibleRpcCommands:visible,modelInvocations:models,sessionRestartVerified:true,crossSessionProjectionVerified:true,naturalProcessExits:3,publicHost:{mode:host.mode,hasUI:host.hasUI,canonicalCommands:11,canonicalTools:toolNames.length,toolsEnabled:true}}));
} finally {rmSync(root,{recursive:true,force:true});}
