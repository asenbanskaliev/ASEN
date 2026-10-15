import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {formatActivePlanContext} from "../src/runtime/plan-context.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";

function row(role:string,state:string,requestId:string):any{return {requestId,title:"internal task title",plan:{role,skillPaths:[]},events:[{at:"2026-10-14T10:00:00.000Z"}],current:{state}};}
function host(){const events=new Map<string,Function[]>(),tools=new Map<string,any>();return {events,tools,pi:{on(name:string,handler:Function){events.set(name,[...(events.get(name)??[]),handler]);},registerCommand(){},registerTool(tool:any){tools.set(tool.name,tool);}}};}

test("active plan context shows concise progress without private IDs or authority",()=>{
 const context=formatActivePlanContext([
  row("explorer","succeeded","asen-plan:task-secret:explorer"),
  row("worker","blocked","asen-plan:task-secret:worker"),
  row("reviewer","planned","asen-plan:task-secret:reviewer"),
  row("primary","done","asen-plan:old-plan:primary"),
  {...row("primary","running","manual-task"),requestId:"manual-task"},
 ]);
 assert.match(context,/exploración: realizado, pendiente de revisión/u);
 assert.match(context,/cambio: bloqueado; requiere atención/u);
 assert.match(context,/revisión independiente: pendiente/u);
 assert.match(context,/No concede permisos ni autoriza reanudar/u);
 assert.doesNotMatch(context,/task-secret|internal task title|manual-task|old-plan/u);
 assert.equal(formatActivePlanContext([row("primary","done","asen-plan:done:primary")]),"");
 assert.equal(formatActivePlanContext([row("primary","planned","asen-plan:small:primary")],128),"");
 assert.match(formatActivePlanContext([row("primary","planned","asen-plan:one:primary"),row("worker","blocked","asen-plan:two:worker")]),/planes activos/u);
 assert.ok(Buffer.byteLength(formatActivePlanContext(Array.from({length:30},(_,i)=>row("worker","planned",`asen-plan:many:${i}:worker`))),"utf8")<=2048);
});

test("Pi receives active plan status only for its exact session and project",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-plan-context-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const project=await realpath(root),foreign=await mkdtemp(path.join(root,"foreign-")),foreignProject=await realpath(foreign),home=path.join(root,"home"),store=await SessionTodoStore.open(path.join(root,"todos.json"));
 const identity={sessionId:"active-session",projectId:project},created=await store.addPlan([{title:"Implement the approved change",requestId:"asen-plan:private-plan:primary",dependsOn:[],description:"Carry out the bounded requested work.",plan:{role:"primary",skillPaths:[]}}],identity);
 await store.update(created[0]!.taskId,identity,1,"running");
 const state=host(),previous=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";
 t.after(()=>{if(previous===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=previous;});
 createAsenExtension({homeDir:()=>home,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,todoStoreFactory:async()=>store})(state.pi);
 const context=(sessionId:string,cwd=project)=>({cwd,hasUI:true,sessionManager:{getSessionId:()=>sessionId},ui:{notify:()=>{}}});
 await state.events.get("session_start")![0]!({},context(identity.sessionId));
 const sections:Record<string,string>={};await state.events.get("before_agent_start")![0]!({prompt:"Continue the change",systemPromptOptions:{sections}},context(identity.sessionId));
 assert.match(sections.asen_active_plan!,/trabajo principal: bloqueado; requiere atención/u);assert.doesNotMatch(sections.asen_active_plan!,/private-plan|todo-[a-f0-9-]+/u);
 for(const other of [context("different-session"),context(identity.sessionId,foreignProject)]){
  await state.events.get("before_agent_start")![0]!({prompt:"Continue",systemPromptOptions:{sections}},other);
  assert.equal(sections.asen_active_plan,undefined,"a reused Pi prompt object must not retain another session or project's plan context");
 }
 await state.events.get("session_shutdown")![0]!({},context(identity.sessionId));
});
