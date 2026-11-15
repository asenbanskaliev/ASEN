import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,realpath,rm,lstat} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {SqliteMemoryStore} from "../src/memory/sqlite-store.js";
import {createPiMemoryBinding,finishPiMemorySession,preparePrivateMemoryDirectory,saveProjectMemory} from "../src/memory/pi-integration.js";

function host(){
 const events=new Map<string,Function[]>(),commands=new Map<string,any>(),tools=new Map<string,any>();
 return {events,commands,tools,pi:{on(name:string,handler:Function){events.set(name,[...(events.get(name)??[]),handler]);},registerCommand(name:string,value:any){commands.set(name,value);},registerTool(value:any){tools.set(value.name,value);},getCommands(){return[];},getAllTools(){return[];} }};
}
const invoke=(tool:any,params:unknown,context:unknown)=>tool.execute("test-call",params,new AbortController().signal,()=>{},context);

test("ASEN memory persists curated notes and a short session summary, then keeps projects isolated",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-pi-memory-store-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const file=path.join(root,"memory.db"),projectA=path.join(root,"project-a"),projectB=path.join(root,"project-b");
 const store=new SqliteMemoryStore(file);const binding=createPiMemoryBinding(store,projectA,"pi-session-a");
 const saved=saveProjectMemory(binding,{kind:"decision",title:"Permission recovery rule",content:"A recovered plan requires fresh approval before any writer starts.",topic:"plan-permission-recovery"});
 assert.ok(saved.id);finishPiMemorySession(binding);store.close();
 const reopened=new SqliteMemoryStore(file);
 assert.match(reopened.formatContext(projectA,{observations:4,maxBytes:4096}),/A recovered plan requires fresh approval/);
 assert.match(reopened.formatContext(projectA,{observations:4,maxBytes:4096}),/Latest Session Summary/);
 assert.equal(reopened.searchWithOptions(projectB,"permission recovery",{matchMode:"any"}).length,0);
 reopened.close();
});

test("ASEN memory rejects likely credentials and redacts explicitly private spans",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-pi-memory-private-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const store=new SqliteMemoryStore(path.join(root,"memory.db")),binding=createPiMemoryBinding(store,"project","session");
 assert.throws(()=>saveProjectMemory(binding,{kind:"observation",title:"Credential test",content:"Do not retain api_key=abcdefghijklmnopqr in project memory."}),/appears to contain a credential/);
 saveProjectMemory(binding,{kind:"observation",title:"Private span handling",content:"The delivery rule remains valid while <private>local secret material</private> is removed."});
 const rows=store.searchWithOptions("project","delivery rule",{matchMode:"any"});
 assert.equal(rows.length,1);assert.doesNotMatch(rows[0]!.content,/local secret material/);assert.match(rows[0]!.content,/\[REDACTED\]/);
 finishPiMemorySession(binding);store.close();
});

test("ASEN memory provisions a private database directory and file",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-pi-memory-mode-"));t.after(()=>rm(root,{recursive:true,force:true}));const file=path.join(root,".asen","memory.db");
 await preparePrivateMemoryDirectory(file);const directory=await lstat(path.dirname(file)),database=await lstat(file);
 assert.equal(directory.isDirectory(),true);assert.equal(database.isFile(),true);
 if(process.platform!=="win32"){assert.equal(directory.mode&0o777,0o700);assert.equal(database.mode&0o777,0o600);}
});

test("Pi startup retrieves project memory and exposes bounded save/search tools",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-pi-memory-runtime-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const project=await realpath(root),home=path.join(root,"home"),file=path.join(home,".asen","memory.db"),state=host(),previous=process.env.ASEN_NO_SKILL_REGISTRY;
 process.env.ASEN_NO_SKILL_REGISTRY="1";t.after(()=>{if(previous===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=previous;});
 createAsenExtension({homeDir:()=>home,enableMemoryRuntime:true,memoryStoreFile:file,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false})(state.pi);
 const context=(sessionId:string,cwd=project)=>({cwd,sessionManager:{getSessionId:()=>sessionId},hasUI:true,ui:{notify:()=>{},confirm:async()=>true}});
 await state.events.get("session_start")![0]!({},context("session-a"));
 assert.ok(state.tools.has("asen_memory_save"));assert.ok(state.tools.has("asen_memory_search"));
 await invoke(state.tools.get("asen_memory_save"),{kind:"decision",title:"Deployment checklist rule",content:"ASEN verifies the deployed candidate before accepting completion.",topic:"deployment-verification"},context("session-a"));
 const memoryCommand=state.commands.get("asen-memory")!;
 assert.match((await memoryCommand.handler("status",context("session-a")) as string[]).join("\n"),/1 recuerdos/);
 const searchRows=await memoryCommand.handler("search deployment candidate",context("session-a")) as string[];
 assert.equal(searchRows.length,1);const memoryId=searchRows[0]!.split(" | ")[0]!;
 assert.deepEqual(await memoryCommand.handler(`forget ${memoryId}`,{...context("session-a"),ui:{notify:()=>{},confirm:async()=>false}}),["No se ha borrado ningún recuerdo."]);
 assert.equal((await memoryCommand.handler("search deployment candidate",context("session-a")) as string[]).length,1);
 const sections:{[key:string]:string}={};await state.events.get("before_agent_start")![0]!({prompt:"What is the deployment verification rule?",systemPromptOptions:{sections}},context("session-a"));
 assert.match(sections.asen_project_memory!,/project-scoped and bounded/);assert.match(sections.asen_project_memory_context!,/ASEN verifies the deployed candidate/);
 await state.events.get("before_agent_start")![0]!({prompt:"deployment verification",systemPromptOptions:{sections}},context("foreign-session"));
 assert.equal(sections.asen_project_memory_context,undefined,"a reused Pi prompt object must not retain another session's memory context");
 await assert.rejects(()=>invoke(state.tools.get("asen_memory_search"),{query:"deployment"},context("foreign-session")),/unavailable for this Pi session and project/);
 await state.events.get("session_start")![0]!({},context("session-b"));
 const resumed:{[key:string]:string}={};await state.events.get("before_agent_start")![0]!({prompt:"How is the deployment candidate verified?",systemPromptOptions:{sections:resumed}},context("session-b"));
 assert.match(resumed.asen_project_memory_context!,/Latest Session Summary/);assert.match(resumed.asen_project_memory_context!,/deployed candidate/);
 const resumedSearch=await state.commands.get("asen-memory")!.handler("search deployment candidate",context("session-b")) as string[],savedId=resumedSearch[0]!.split(" | ")[0]!;
 assert.deepEqual(await state.commands.get("asen-memory")!.handler(`forget ${savedId}`,context("session-b")),["Recuerdo borrado de la memoria activa del proyecto."]);
 const afterForget=await state.commands.get("asen-memory")!.handler("search deployment candidate",context("session-b")) as string[];assert.deepEqual(afterForget,["No hay recuerdos relacionados en este proyecto."]);
 const otherProject=await mkdtemp(path.join(root,"foreign-")),foreignContext=context("session-c",await realpath(otherProject));
 await state.events.get("session_start")![0]!({},foreignContext);
 const foreign:{[key:string]:string}={};await state.events.get("before_agent_start")![0]!({prompt:"deployment verification candidate",systemPromptOptions:{sections:foreign}},foreignContext);
 assert.doesNotMatch(foreign.asen_project_memory_context??"",/ASEN verifies the deployed candidate/);
 await state.events.get("session_shutdown")![0]!({},foreignContext);
 const reopened=new SqliteMemoryStore(file);assert.equal(reopened.searchWithOptions(project,"deployment candidate",{matchMode:"any"}).length,0);assert.doesNotMatch(reopened.formatContext(project,{observations:4,maxBytes:4096}),/Latest Session Summary/);reopened.close();
});
