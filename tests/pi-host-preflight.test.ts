import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import asen,{createPiExtension} from "../extensions/asen.js";
import {validatePiExecutionContext,validatePiHost} from "../src/runtime/pi-host.js";
import {VERSION} from "@earendil-works/pi-coding-agent";

test("primary factory rejects missing public APIs before command or tool registration",()=>{
  for(const missing of ["on","registerCommand","registerTool","getCommands","getAllTools"]){
    let commandWrites=0,toolWrites=0;
    const host:any={on(){},registerCommand(){commandWrites++;},registerTool(){toolWrites++;},getCommands(){return[];},getAllTools(){return[];}};
    delete host[missing];
    assert.throws(()=>asen(host),/ASEN.*Pi/);
    assert.equal(commandWrites+toolWrites,0,`${missing} must fail before public registration`);
  }
});

test("preflight preserves the declared minimum and rejects unknown versions and proxies",()=>{
 const host={on(){},registerCommand(){},registerTool(){},getCommands(){return[];},getAllTools(){return[];}};
 for(const version of ["0.85.1","0.85.2","0.86.0","0.87.1","0.99.0","1.0.0","1.1.0","1.99.9"])assert.doesNotThrow(()=>validatePiHost(host,version));
 for(const version of [undefined,"unknown","0.84.999","0.85.0","2.0.0","1.1.0-beta","garbage 1.1.0","v1.1.0","1.1.0\\n","01.1.0","1.01.0","1.1.00",1.1])assert.throws(()=>validatePiHost(host,version),/known Pi version/);
 let traps=0;const proxy=new Proxy(host,{getOwnPropertyDescriptor(){traps++;throw new Error("must not execute");}});
 assert.throws(()=>validatePiHost(proxy,"1.1.0"),/public Pi extension API/);assert.equal(traps,0);
});

test("primary factory refuses host accessors without executing them",()=>{
  let reads=0,writes=0;
  const host:any={on(){},registerTool(){writes++;},getCommands(){return[];},getAllTools(){return[];}};
  Object.defineProperty(host,"registerCommand",{enumerable:true,get(){reads++;return ()=>writes++;}});
  assert.throws(()=>asen(host),/ASEN.*Pi/);
  assert.equal(reads,0);assert.equal(writes,0);
});

function productionHost(commandInventory:unknown[]=[],toolInventory:unknown[]=[]){
 const events=new Map<string,Function[]>(),commands=new Map<string,any>(),tools=new Map<string,any>(),messages:string[]=[];
 const host={on(name:string,handler:Function){events.set(name,[...(events.get(name)??[]),handler]);},
  registerCommand(name:string,command:any){if(commands.has(name))throw Error("duplicate command");commands.set(name,command);},
  registerTool(tool:any){if(tools.has(tool.name))throw Error("duplicate tool");tools.set(tool.name,tool);},
  getCommands(){return commandInventory;},getAllTools(){return toolInventory;}};
 const context=(mode:string="rpc")=>({mode,hasUI:true,ui:{notify:(message:string)=>messages.push(message)},cwd:process.cwd(),sessionManager:{getSessionId:()=>"session"}});
 return {host,events,commands,tools,messages,commandInventory,toolInventory,context};
}
async function shutdown(state:ReturnType<typeof productionHost>):Promise<void>{for(const listener of state.events.get("session_shutdown")??[])await listener({},state.context());}

test("repeated activation on the same Pi host registers only one startup hook",()=>{
 const state=productionHost(),dependencies={enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false};
 createPiExtension(dependencies)(state.host as any);createPiExtension(dependencies)(state.host as any);
 assert.equal(state.events.get("session_start")?.length,1);
});

test("separately loaded copies share the Pi-host activation guard",async()=>{
 const state=productionHost(),dependencies={enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false};
 const copyUrl=new URL("../extensions/asen.ts",import.meta.url);copyUrl.searchParams.set("copy","independent-module");
 const copy=await import(copyUrl.href);
 createPiExtension(dependencies)(state.host as any);copy.createPiExtension(dependencies)(state.host as any);
 assert.equal(state.events.get("session_start")?.length,1,"a second package copy must not add a competing startup hook");
});

test("factory waits for initialized public inventories then registers one collision-free extension",async()=>{
 const home=mkdtempSync(path.join(tmpdir(),"asen-pi-host-preflight-")),prior=process.env.ASEN_NO_SKILL_REGISTRY;
 const state=productionHost();
 process.env.ASEN_NO_SKILL_REGISTRY="1";
 try{
  createPiExtension({homeDir:()=>home})(state.host as any);
  assert.equal(state.commands.size,0);assert.equal(state.tools.size,0);
  await state.events.get("session_start")![0]!({},state.context());
  assert.ok(state.commands.has("asen"));assert.ok(state.commands.has("asen-review"));
  assert.deepEqual([...state.tools.keys()].sort(), ["asen_agent_cancel", "asen_agent_continue", "asen_agent_retry", "asen_agent_start", "asen_agent_status", "asen_ask_choice", "asen_ask_question", "asen_memory_save", "asen_memory_search", "asen_plan_dispatch_next", "asen_plan_request", "asen_todo_accept_result", "asen_todo_add", "asen_todo_inspect_interrupted_write", "asen_todo_list", "asen_todo_update", "ask_user_choice", "ask_user_question", "codegraph"]);
  assert.equal(state.messages.some(message=>message.includes("host preflight failed")),false);
 }finally{await shutdown(state);if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;rmSync(home,{recursive:true,force:true});}
});

test("deferred session startup runs once for the first session and every later session",async()=>{
 const home=mkdtempSync(path.join(tmpdir(),"asen-pi-session-start-")),prior=process.env.ASEN_NO_SKILL_REGISTRY;
 const state=productionHost();
 process.env.ASEN_NO_SKILL_REGISTRY="1";
 try{
  createPiExtension({homeDir:()=>home})(state.host as any);
  const listeners=state.events.get("session_start")!;
  assert.equal(listeners.length,1,"production registers only the bootstrap hook before host initialization");
  await listeners[0]!({},state.context());
  const usagePath=path.join(home,".asen","usage.json");
  assert.equal(JSON.parse(readFileSync(usagePath,"utf8")).snapshot.sessions,1);
  await listeners[0]!({},state.context());
  assert.equal(JSON.parse(readFileSync(usagePath,"utf8")).snapshot.sessions,2);
  assert.equal(state.messages.length,0);
 }finally{await shutdown(state);if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;rmSync(home,{recursive:true,force:true});}
});

test("later sessions reject invalid public contexts before lifecycle or registration mutation",async()=>{
 const home=mkdtempSync(path.join(tmpdir(),"asen-pi-session-revalidation-")),prior=process.env.ASEN_NO_SKILL_REGISTRY;
 const state=productionHost();
 process.env.ASEN_NO_SKILL_REGISTRY="1";
 try{
  createPiExtension({homeDir:()=>home})(state.host as any);
  const bootstrap=state.events.get("session_start")![0]!;
  await bootstrap({},state.context());
  const usagePath=path.join(home,".asen","usage.json"),registrations=[state.commands.size,state.tools.size];
  for(const context of [state.context("unknown"),{...state.context(),hasUI:"true"}]){
   await assert.rejects(bootstrap({},context),/execution mode or context/);
   assert.equal(JSON.parse(readFileSync(usagePath,"utf8")).snapshot.sessions,1);
   assert.deepEqual([state.commands.size,state.tools.size],registrations);
  }
 }finally{await shutdown(state);if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;rmSync(home,{recursive:true,force:true});}
});

test("preflight rejection retries on a later session after the collision is removed",async()=>{
 const state=productionHost([{name:"asen"}]);createPiExtension({enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false})(state.host as any);
 const bootstrap=state.events.get("session_start")![0]!;
 await bootstrap({},state.context());assert.equal(state.commands.size,0);
 state.commandInventory.length=0;
 await bootstrap({},state.context());assert.ok(state.commands.has("asen"));assert.equal(state.tools.size,8);
});

test("partial host registration remains inert and requires a controlled Pi reload",async()=>{
 const state=productionHost(),original=state.host.registerCommand.bind(state.host);let attempts=0;
 state.host.registerCommand=(name:string,command:any)=>{if(++attempts===3)throw Error("injected command registration failure");original(name,command);};
 createPiExtension({enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false})(state.host as any);const bootstrap=state.events.get("session_start")![0]!;
 await bootstrap({},state.context());
 assert.equal(state.commands.size,2);assert.equal(state.tools.size,7);
 assert.match(state.messages.join("\n"),/partial registrations remain inert; reload Pi to recover/);
 const first=[...state.commands.values()][0];await assert.rejects(first.handler("",state.context()),/disabled after an incomplete host setup/);
 await bootstrap({},state.context());assert.equal(attempts,3,"partial registrations are not duplicated on a later session");
});

test("command and tool collisions stop every registration before host mutation",async()=>{
 for(const state of [productionHost([{name:"asen"}]),productionHost([],[{name:"asen_ask_choice"}]),productionHost([],[{name:"ask_user_question"}])]){
  asen(state.host as any);await state.events.get("session_start")![0]!({},state.context());
  assert.equal(state.commands.size,0);assert.equal(state.tools.size,0);
  assert.match(state.messages.join("\n"),/host preflight failed/);
 }
});

test("unsupported execution mode fails before any runtime registration",async()=>{
 const state=productionHost();asen(state.host as any);
 await state.events.get("session_start")![0]!({},state.context("unknown"));
 assert.equal(state.commands.size,0);assert.equal(state.tools.size,0);
 assert.match(state.messages.join("\n"),/execution mode or context/);
});

test("public modes and boolean UI contexts are supported",()=>{
 for(const mode of ["tui","rpc","json","print"]){
  for(const hasUI of [true,false]){
   const context=Object.defineProperties({}, {mode:{get:()=>mode},hasUI:{get:()=>hasUI}});
   assert.doesNotThrow(()=>validatePiExecutionContext(context));
  }
 }
 assert.throws(()=>validatePiExecutionContext({mode:"rpc",hasUI:"true"}),/execution mode or context/);
});

test("missing or incomplete initialized inventories fail closed",async()=>{
 const missing=productionHost();(missing.host as any).getAllTools=undefined;
 assert.throws(()=>asen(missing.host as any),/callable Pi getAllTools/);
 assert.equal(missing.commands.size,0);
 const incomplete=productionHost(new Array(1));asen(incomplete.host as any);
 await incomplete.events.get("session_start")![0]!({},incomplete.context());
 assert.equal(incomplete.commands.size,0);assert.match(incomplete.messages.join("\n"),/inventory/);
});

test("ECO-06 public Pi preflight rejects missing tools and commands without host mutation",()=>{
 const names=["on","registerCommand","registerTool","getCommands","getAllTools"] as const;
 for(const missing of names){
  let registrations=0;
  const host:any={on(){},registerCommand(){registrations++;},registerTool(){registrations++;},getCommands(){return[];},getAllTools(){return[];}};
  delete host[missing];
  assert.throws(()=>validatePiHost(host,"1.1.0"),/requires callable Pi|public Pi extension API/);
  assert.equal(registrations,0);
 }
});

test("ECO-02 startup collision recovery does not duplicate registrations across three sessions",async()=>{
 const state=productionHost([{name:"asen"}]);
 createPiExtension({enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false})(state.host as any);
 const bootstrap=state.events.get("session_start")![0]!;
 await bootstrap({},state.context());
 assert.equal(state.commands.size,0);assert.equal(state.tools.size,0);
 state.commandInventory.length=0;
 await bootstrap({},state.context());
 const commandCount=state.commands.size,toolCount=state.tools.size;
 assert.ok(commandCount>0);assert.ok(toolCount>0);
 await bootstrap({},state.context());
 assert.equal(state.commands.size,commandCount,"repeated session must not register commands twice");
 assert.equal(state.tools.size,toolCount,"repeated session must not register tools twice");
});

test("ECO-02 tool collision recovery requires fresh inventory and never registers during a failed preflight",async()=>{
 const state=productionHost([],[{name:"asen_ask_choice"}]);
 createPiExtension({enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false})(state.host as any);
 const bootstrap=state.events.get("session_start")![0]!;
 await bootstrap({},state.context());
 assert.equal(state.commands.size,0);assert.equal(state.tools.size,0);
 state.toolInventory.length=0;
 await bootstrap({},state.context());
 assert.ok(state.commands.size>0);assert.ok(state.tools.size>0);
 const registrations=[state.commands.size,state.tools.size];
 await bootstrap({},state.context());
 assert.deepEqual([state.commands.size,state.tools.size],registrations);
});

test("ECO-02 malformed inventory can recover on a later session without partial registration",async()=>{
 const state=productionHost(new Array(1));
 createPiExtension({enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false})(state.host as any);
 const bootstrap=state.events.get("session_start")![0]!;
 await bootstrap({},state.context());
 assert.equal(state.commands.size,0);assert.equal(state.tools.size,0);
 state.commandInventory.splice(0,1);
 await bootstrap({},state.context());
 assert.ok(state.commands.size>0);assert.ok(state.tools.size>0);
 const counts=[state.commands.size,state.tools.size];
 await bootstrap({},state.context());
 assert.deepEqual([state.commands.size,state.tools.size],counts);
});
