import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {mkdtemp,rm,writeFile,mkdir,realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {writeProfilesFile} from "../src/runtime/profile-store.js";
import {ASEN_PROFILES_SCHEMA,type RuntimeProfilesFile} from "../src/runtime/profiles.js";

async function layer(dir:string,name:string,model:string,thinking:"off"|"minimal"|"low"|"medium"|"high"="low"):Promise<void>{
 await mkdir(path.join(dir,".asen"),{recursive:true});
 const data:RuntimeProfilesFile={schema:ASEN_PROFILES_SCHEMA,active:name,profiles:[{name,routes:{explorer:{model,thinking},worker:{model,thinking},reviewer:{model,thinking},verifier:{model,thinking}}}]} as any;
 if(!dir.endsWith(".asen")) await writeProfilesFile(path.join(dir,".asen","profiles.json"),data);
 else await writeProfilesFile(path.join(dir,"profiles.json"),data);
}

function profile(name:string,m:string,t:"off"|"minimal"|"low"|"medium"|"high"="low"):RuntimeProfilesFile{
 return {schema:ASEN_PROFILES_SCHEMA,active:name,profiles:[{name,routes:{explorer:{model:m,thinking:t},worker:{model:m,thinking:t},reviewer:{model:m,thinking:t},verifier:{model:m,thinking:t}}}]};
}

test("real profile files reach planner and agent requests", async t=>{
 const home=await mkdtemp(path.join(tmpdir(),"asen-real-profile-home-"));
 const project=await realpath(await mkdtemp(path.join(tmpdir(),"asen-real-profile-project-")));
 const commands=new Map<string,any>(); const tools=new Map<string,any>(); const events=new Map<string,Function[]>();
 const captured: any[]=[]; const waiting=new Map<string,(r:any)=>void>();
 const pi={registerCommand:(n:string,c:any)=>commands.set(n,c),registerTool:(tool:any)=>tools.set(tool.name,tool),on:(n:string,h:Function)=>events.set(n,[...(events.get(n)??[]),h]),getCommands:()=>[],getAllTools:()=>[]};
 await writeProfilesFile(path.join(home,".asen","profiles.json"),profile("global","global/model","low"));
 await layer(project,"project","project/model","high");
 createAsenExtension({homeDir:()=>home,profilesFile:path.join(home,".asen","profiles.json"),enableAgentRuntime:true,enableTodoRuntime:false,enableMemoryRuntime:false,autoAdvancePlans:false,agentStoreFile:path.join(home,".asen","agents.json"),agentRunner:{run:async (request:any)=>{captured.push(request);waiting.get(request.id)?.(request);return{id:request.id,ok:true,output:"inert"};}}})(pi as any);
 t.after(async()=>{for(const ctx of []){} await rm(home,{recursive:true,force:true}); await rm(project,{recursive:true,force:true});});
 const ctx={cwd:project,hasUI:true,sessionManager:{getSessionId:()=> "sess-real-profile"},ui:{notify:()=>{}}};
 for(const h of events.get("session_start")??[]) await h({},ctx);
 // Plan command should prefer project model
 const facts={taskIdentity:"real-profile-plan",instruction:"Implement bounded change",intent:"implementation",scope:{kind:"known",expectedPaths:["src/a.ts","src/b.ts","src/c.ts","src/d.ts"]},writes:[{path:"src/a.ts",changeKind:"behavior"}],riskOperations:[],session:{estimatedMinutes:10,continuation:false},testing:{kind:"required"},review:{kind:"dual_explicit",estimatedMinutes:5},unresolvedDecisions:[]};
 const planned=JSON.parse(await commands.get("asen-plan").handler(JSON.stringify(facts),ctx));
 assert.equal(planned.executablePlan.tasks.find((x:any)=>x.role==="worker").model,"project/model");
 // Read-only explorer agent should use project model and thinking
 const started=await tools.get("asen_agent_start").execute("real-agent",{prompt:"inspect project"},new AbortController().signal,()=>{},ctx);
 const id=started.details.id;
 const request = captured.find((r:any)=>r.id===id) ?? await new Promise<any>(resolve=>waiting.set(id,resolve));
 assert.equal(request.model,"project/model"); assert.equal(request.thinking,"high");
});

test("missing profiles fail closed on agent dispatch", async t=>{
 const home=await mkdtemp(path.join(tmpdir(),"asen-real-profile-missing-"));
 const project=await realpath(await mkdtemp(path.join(tmpdir(),"asen-real-profile-missingproj-")));
 const commands=new Map<string,any>(); const tools=new Map<string,any>(); const events=new Map<string,Function[]>();
 const pi={registerCommand:(n:string,c:any)=>commands.set(n,c),registerTool:(tool:any)=>tools.set(tool.name,tool),on:(n:string,h:Function)=>events.set(n,[...(events.get(n)??[]),h]),getCommands:()=>[],getAllTools:()=>[]};
 await mkdir(path.join(home,".asen"),{recursive:true});
 createAsenExtension({homeDir:()=>home,profilesFile:path.join(home,".asen","profiles.json"),enableAgentRuntime:true,enableTodoRuntime:false,enableMemoryRuntime:false,autoAdvancePlans:false,agentStoreFile:path.join(home,".asen","agents.json"),agentRunner:{run:async (_request:any)=>{throw new Error("Rejected missing-profile routing must never run");}}})(pi as any);
 t.after(async()=>{await rm(home,{recursive:true,force:true}); await rm(project,{recursive:true,force:true});});
 const ctx={cwd:project,hasUI:true,sessionManager:{getSessionId:()=> "sess-missing-profile"},ui:{notify:()=>{}}};
 for(const h of events.get("session_start")??[]) await h({},ctx);
 await assert.rejects(()=>tools.get("asen_agent_start").execute("missing-agent",{prompt:"inspect missing"},new AbortController().signal,()=>{},ctx),/No valid model resolved/);
 const status=await tools.get("asen_agent_status").execute("missing-status",{},new AbortController().signal,()=>{},ctx);
 assert.deepEqual(status.details,[],"Rejected routing must not enqueue an agent");
});
