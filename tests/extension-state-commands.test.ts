import assert from "node:assert/strict";import test from "node:test";import {mkdtemp,realpath,rm,writeFile} from "node:fs/promises";import {tmpdir} from "node:os";import path from "node:path";import {createAsenExtension} from "../extensions/asen.js";import {writeProfilesFile} from "../src/runtime/profile-store.js";import {ASEN_PROFILES_SCHEMA} from "../src/runtime/profiles.js";import {SessionTodoStore} from "../src/runtime/todo-store.js";import {PersistentWorkspaceStore} from "../src/runtime/workspace-store.js";
function host(){const commands=new Map<string,{handler:(...args:any[])=>unknown}>();return {commands,pi:{registerCommand:(n:string,c:any)=>commands.set(n,c)}};}
test("state commands compose existing runtime projections without inventing data",async()=>{const d=await mkdtemp(path.join(tmpdir(),"asen-state-")),f=path.join(d,"profiles.json");await writeProfilesFile(f,{schema:ASEN_PROFILES_SCHEMA,active:"main",profiles:[{name:"main",routes:{}}]});const h=host();createAsenExtension({profilesFile:f,agents:()=>[],changes:()=>[]})(h.pi);assert.deepEqual(await h.commands.get("asen-profiles")!.handler(),{active:"main",profiles:["main"],available:true});assert.deepEqual(await h.commands.get("asen-agents")!.handler(),[]);assert.deepEqual(await h.commands.get("asen-changes")!.handler(),[]);});
test("state commands report local profile defaults and fail closed for absent runtime providers",async()=>{const h=host();createAsenExtension()(h.pi);assert.deepEqual(await h.commands.get("asen-profiles")!.handler(),{active:"default",profiles:[],available:true});assert.match((await h.commands.get("asen-agents")!.handler() as string[])[0]!,/unavailable/);assert.match((await h.commands.get("asen-changes")!.handler() as string[])[0]!,/unavailable/);});
test("asen-todos shows only the active session and project with bounded state and recovery reason",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-todos-ui-"));t.after(()=>rm(root,{recursive:true,force:true}));const store=await SessionTodoStore.open(path.join(root,"todos.json")),project=await realpath(process.cwd());
 const own=await store.add("Inspect active project",{sessionId:"session-ui",projectId:project}),foreign=await store.add("Foreign task",{sessionId:"other-session",projectId:project});await store.update(own.taskId,{sessionId:"session-ui",projectId:project},1,"running");await store.recover({sessionId:"session-ui",projectId:project});
 const h=host();createAsenExtension({todoStoreFactory:async()=>store})(h.pi);const messages:string[]=[],rows=await h.commands.get("asen-todos")!.handler("",{cwd:process.cwd(),sessionManager:{getSessionId:()=>"session-ui"},ui:{notify:(message:string)=>messages.push(message)}}) as string[];
 assert.equal(rows.length,1);assert.match(rows[0]!,/Pausada; requiere revisión.*Inspect active project.*explicit review/i);assert.ok(!rows.join("\n").includes(foreign.taskId));assert.deepEqual(messages,[rows.join("\n")]);
});
test("asen-changes reads reopened workspace history only for the active session and project",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-changes-ui-"));t.after(()=>rm(root,{recursive:true,force:true}));const project=await realpath(root),file=path.join(root,".asen","workspace.json"),store=await PersistentWorkspaceStore.open(file);
 const change=(sessionId:string,pathName:string)=>({path:pathName,actor:{kind:"agent" as const,id:`agent-${sessionId}`},sessionId,projectId:project,worktree:project,operation:"modify" as const,at:"2026-10-10T10:00:00.000Z"});
 await store.append(change("session-ui","src/owned.ts"));await store.append(change("other-session","src/foreign.ts"));const reopened=await PersistentWorkspaceStore.open(file),h=host();createAsenExtension({workspaceStoreFactory:async()=>reopened})(h.pi);
 const messages:string[]=[],rows=await h.commands.get("asen-changes")!.handler("",{cwd:project,sessionManager:{getSessionId:()=>"session-ui"},ui:{notify:(message:string)=>messages.push(message)}}) as string[];
 assert.equal(rows.length,1);assert.match(rows[0]!,/src\/owned\.ts/);assert.ok(!rows.join("\n").includes("foreign"));assert.deepEqual(messages,[rows.join("\n")]);
});
test("asen-changes surfaces same-session actor conflicts as review-only and keeps other sessions private",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-change-conflicts-"));t.after(()=>rm(root,{recursive:true,force:true}));const project=await realpath(root),store=await PersistentWorkspaceStore.open(path.join(root,".asen","workspace.json"));
 const change=(sessionId:string,actorId:string,pathName:string)=>({path:pathName,actor:{kind:"agent" as const,id:actorId},sessionId,projectId:project,worktree:project,operation:"modify" as const,at:"2026-10-10T10:00:00.000Z"});
 await store.append(change("session-ui","agent-a","src/shared.ts"));await store.append(change("session-ui","agent-b","src/shared.ts"));await store.append(change("foreign-session","secret-agent","src/foreign.ts"));
 const h=host();createAsenExtension({workspaceStoreFactory:async()=>store})(h.pi);const rows=await h.commands.get("asen-changes")!.handler("",{cwd:project,sessionManager:{getSessionId:()=>"session-ui"},ui:{notify:()=>{}}}) as string[],output=rows.join("\n");
 assert.match(output,/Potential conflicts require review; no content comparison, winner selection, or automatic resolution/);assert.match(output,/potential conflict agent:agent-a -> agent:agent-b src\/shared\.ts/);assert.ok(!output.includes("foreign-session"));assert.ok(!output.includes("secret-agent"));
});
test("asen-route previews exact ODD facts from the active session without dispatching agents",async()=>{
 const h=host();createAsenExtension()(h.pi);const command=h.commands.get("asen-route")!;
 const facts={taskIdentity:"task-1",intent:"implementation",scope:{kind:"known",expectedPaths:["src/a.ts"]},writes:[{path:"src/a.ts",changeKind:"behavior"}],riskOperations:[],session:{estimatedMinutes:10,continuation:false},testing:{kind:"required"},review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[]};
 const context={cwd:process.cwd(),sessionManager:{getSessionId:()=>"route-session"}},preview=await command.handler(JSON.stringify(facts),context) as string;
 assert.match(preview,/route: direct/);assert.match(preview,/Preview only: no agent was dispatched and no write permission was granted/);
 await assert.rejects(async()=>await command.handler(JSON.stringify({...facts,repositoryIdentity:"/foreign/project"}),context),/exactly/);
 await assert.rejects(async()=>await command.handler(JSON.stringify({...facts,scope:{kind:"known",expectedPaths:["../secret"]}}),context),/canonical relative/);
 await assert.rejects(async()=>await command.handler(JSON.stringify(facts),{cwd:process.cwd()}),/active Pi session/);
});
test("asen-plan composes the existing ODD and orchestrator without retrieving, reviewing, authorizing or executing",async()=>{
 const h=host();createAsenExtension()(h.pi);const command=h.commands.get("asen-plan")!;
 const facts={taskIdentity:"sensitive-plan",instruction:"Rotate credentials and publish the change",intent:"implementation",scope:{kind:"known",expectedPaths:["src/auth.ts"]},writes:[{path:"src/auth.ts",changeKind:"security"}],riskOperations:["credential_or_auth"],session:{estimatedMinutes:30,continuation:false},testing:{kind:"required"},review:{kind:"dual_explicit",estimatedMinutes:20},unresolvedDecisions:[]};
 const result=JSON.parse(await command.handler(JSON.stringify(facts),{cwd:process.cwd(),sessionManager:{getSessionId:()=>"plan-session"}}) as string);
 assert.equal(result.route,"plan");assert.equal(result.risk,"high");assert.equal(result.sensitiveOperationsPresent,true);
 assert.deepEqual(result.requiredAgentRoles,[]);assert.deepEqual(result.execution,{started:false,authorized:false});
 assert.deepEqual(result.actions,{informationRetrieved:false,reviewRequested:false});assert.equal(result.persistence.status,"unavailable");assert.match(result.notice,/No agent was dispatched/);
 await assert.rejects(async()=>await command.handler(JSON.stringify(facts),{cwd:process.cwd()}),/active Pi session/);
 await assert.rejects(async()=>await command.handler(JSON.stringify({...facts,extra:true}),{cwd:process.cwd(),sessionManager:{getSessionId:()=>"plan-session"}}),/exactly/);
 await assert.rejects(async()=>await command.handler(JSON.stringify({...facts,instruction:" padded "}),{cwd:process.cwd(),sessionManager:{getSessionId:()=>"plan-session"}}),/instruction is invalid/);
});
test("asen-plan previews bounded orchestration roles without dispatching or granting execution",async()=>{
 const h=host();createAsenExtension()(h.pi);const command=h.commands.get("asen-plan")!,paths=["src/a.ts","src/b.ts","src/c.ts","src/d.ts"];
 const result=JSON.parse(await command.handler(JSON.stringify({taskIdentity:"orchestrated-plan",instruction:"Implement the bounded change",intent:"implementation",scope:{kind:"known",expectedPaths:paths},writes:[{path:"src/a.ts",changeKind:"behavior"}],riskOperations:[],session:{estimatedMinutes:20,continuation:false},testing:{kind:"required"},review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[]}),{cwd:process.cwd(),sessionManager:{getSessionId:()=>"orchestrator-session"}}) as string);
 assert.equal(result.route,"orchestrate");assert.deepEqual(result.requiredAgentRoles,["explorer","worker","reviewer","verifier"]);
 assert.equal(result.requiresSingleWriter,true);assert.equal(result.requiresIsolatedChild,true);assert.deepEqual(result.execution,{started:false,authorized:false});
 assert.deepEqual(result.executablePlan.tasks.map((task:any)=>task.role),["explorer","worker","reviewer","verifier"]);
 assert.equal(result.persistence.status,"unavailable");
 assert.deepEqual(result.actions,{informationRetrieved:false,reviewRequested:false});
});
test("asen-plan persists its DAG in the active Todo store and enforces predecessor completion",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-plan-dag-"));t.after(()=>rm(root,{recursive:true,force:true}));const store=await SessionTodoStore.open(path.join(root,"todos.json")),h=host();createAsenExtension({todoStoreFactory:async()=>store})(h.pi);
 const paths=["src/a.ts","src/b.ts","src/c.ts","src/d.ts"],session={sessionManager:{getSessionId:()=>"dag-session"},cwd:process.cwd()},result=JSON.parse(await h.commands.get("asen-plan")!.handler(JSON.stringify({taskIdentity:"dag-plan",instruction:"Implement bounded change",intent:"implementation",scope:{kind:"known",expectedPaths:paths},writes:[{path:"src/a.ts",changeKind:"behavior"}],riskOperations:[],session:{estimatedMinutes:20,continuation:false},testing:{kind:"required"},review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[]}),session) as string);
 assert.equal(result.persistence.status,"saved");assert.equal(result.execution.started,false);assert.equal(result.persistedTasks.length,4);
 const projectId=await realpath(process.cwd()),identity={sessionId:"dag-session",projectId},rows=await store.list(identity);assert.equal(rows.length,4);
 const todoById=new Map(rows.map(row=>[row.taskId,row]));const graph=new Map(result.persistedTasks.map((item:any)=>[item.planTaskId,item]));
 const worker=graph.get("dag-plan:worker") as any,explorer=graph.get("dag-plan:explorer") as any;assert.deepEqual(worker.dependsOn,[explorer.todoId]);
 const explorerTodo=todoById.get(explorer.todoId)!;assert.equal(explorerTodo.plan?.role,"explorer");assert.equal(explorerTodo.plan?.priority,1);assert.equal(explorerTodo.plan?.skillSelection?.phase,"explore");assert.ok(explorerTodo.plan?.skillPaths.includes("skills/asen-explore/SKILL.md"));assert.equal(todoById.get(worker.todoId)?.plan?.priority,2);
 await assert.rejects(()=>store.update(worker.todoId,identity,1,"running"),/dependencies must be verified done/);
 assert.equal(todoById.get(worker.todoId)?.current.state,"planned");
});
test("asen-plan refuses persistence when its Pi session changes while waiting for the Todo transaction",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-plan-session-change-"));t.after(()=>rm(root,{recursive:true,force:true}));const store=await SessionTodoStore.open(path.join(root,"todos.json")),h=host();createAsenExtension({todoStoreFactory:async()=>store})(h.pi);
 let sessionId="session-before";const manager={getSessionId:()=>sessionId},context={cwd:process.cwd(),sessionManager:manager,ui:{notify:()=>{}}},args=JSON.stringify({taskIdentity:"session-change-plan",instruction:"Inspect this request after its scope is clarified",intent:"analysis",scope:{kind:"unknown",reason:"The project scope is not yet known"},writes:[],riskOperations:[],session:{estimatedMinutes:1,continuation:false},testing:{kind:"required"},review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[]});
 await writeFile(`${store.path}.lock`,JSON.stringify({pid:process.pid,token:"plan-owner",createdAt:Date.now()}));const pending=h.commands.get("asen-plan")!.handler(args,context) as Promise<unknown>;const rejection=assert.rejects(pending,/session or project changed/u);await new Promise(resolve=>setTimeout(resolve,30));sessionId="session-after";await rm(`${store.path}.lock`,{force:true});await rejection;
 assert.deepEqual(await store.list({sessionId:"session-before",projectId:await realpath(process.cwd())}),[]);assert.deepEqual(await store.list({sessionId:"session-after",projectId:await realpath(process.cwd())}),[]);
});
test("public data commands publish their result through the Pi UI",async()=>{
 const h=host();createAsenExtension()(h.pi);
 for(const [name,args,context] of [["asen","",{}],["asen-commands","",{}],["asen-status","",{}],["asen-doctor","",{}],["asen-agents","",{}],["asen-changes","",{}],["asen-todos","",{}],["asen-profiles","",{}],["asen-route",JSON.stringify({taskIdentity:"task-2",intent:"analysis",scope:{kind:"known",expectedPaths:[]},writes:[],riskOperations:[],session:{estimatedMinutes:1,continuation:false},testing:{kind:"required"},review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[]}),{cwd:process.cwd(),sessionManager:{getSessionId:()=>"route-session"}}],["asen-plan",JSON.stringify({taskIdentity:"task-plan",instruction:"Inspect this bounded request",intent:"analysis",scope:{kind:"known",expectedPaths:[]},writes:[],riskOperations:[],session:{estimatedMinutes:1,continuation:false},testing:{kind:"required"},review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[]}),{cwd:process.cwd(),sessionManager:{getSessionId:()=>"plan-session"}}]] as const){
  const messages:string[]=[];
  const result=await h.commands.get(name)!.handler(args,{...context,ui:{notify:(message:string)=>messages.push(message)}});
  assert.equal(messages.length,1,`${name} must publish exactly one result`);
  assert.equal(messages[0],typeof result==="string"?result:Array.isArray(result)&&result.every(x=>typeof x==="string")?result.join("\n"):JSON.stringify(result,null,2));
 }
});
