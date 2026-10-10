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
 for(const version of [undefined,"unknown","0.84.999","0.85.0","2.0.0","1.1.0-beta","garbage 1.1.0","v1.1.0","1.1.0\\n",1.1])assert.throws(()=>validatePiHost(host,version),/known Pi version/);
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
 return {host,events,commands,tools,messages,commandInventory,context};
}

test("factory waits for initialized public inventories then registers one collision-free extension",async()=>{
 const home=mkdtempSync(path.join(tmpdir(),"asen-pi-host-preflight-")),prior=process.env.ASEN_NO_SKILL_REGISTRY;
 process.env.ASEN_NO_SKILL_REGISTRY="1";
 try{
  const state=productionHost();createPiExtension({homeDir:()=>home})(state.host as any);
  assert.equal(state.commands.size,0);assert.equal(state.tools.size,0);
  await state.events.get("session_start")![0]!({},state.context());
  assert.ok(state.commands.has("asen"));assert.ok(state.commands.has("asen-review"));
  assert.deepEqual([...state.tools.keys()].sort(),["asen_agent_cancel","asen_agent_continue","asen_agent_start","asen_agent_status","asen_ask_choice","asen_ask_question","asen_code_intelligence","asen_todo_add","asen_todo_list","asen_todo_update","codegraph"]);
  assert.equal(state.messages.some(message=>message.includes("host preflight failed")),false);
 }finally{if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;rmSync(home,{recursive:true,force:true});}
});

test("deferred session startup runs once for the first session and every later session",async()=>{
 const home=mkdtempSync(path.join(tmpdir(),"asen-pi-session-start-")),prior=process.env.ASEN_NO_SKILL_REGISTRY;
 process.env.ASEN_NO_SKILL_REGISTRY="1";
 try{
  const state=productionHost();createPiExtension({homeDir:()=>home})(state.host as any);
  const listeners=state.events.get("session_start")!;
  assert.equal(listeners.length,1,"production registers only the bootstrap hook before host initialization");
  await listeners[0]!({},state.context());
  const usagePath=path.join(home,".asen","usage.json");
  assert.equal(JSON.parse(readFileSync(usagePath,"utf8")).snapshot.sessions,1);
  await listeners[0]!({},state.context());
  assert.equal(JSON.parse(readFileSync(usagePath,"utf8")).snapshot.sessions,2);
  assert.equal(state.messages.length,0);
 }finally{if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;rmSync(home,{recursive:true,force:true});}
});

test("preflight rejection retries on a later session after the collision is removed",async()=>{
 const state=productionHost([{name:"asen"}]);createPiExtension({enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false})(state.host as any);
 const bootstrap=state.events.get("session_start")![0]!;
 await bootstrap({},state.context());assert.equal(state.commands.size,0);
 state.commandInventory.length=0;
 await bootstrap({},state.context());assert.ok(state.commands.has("asen"));assert.equal(state.tools.size,4);
});

test("partial host registration remains inert and requires a controlled Pi reload",async()=>{
 const state=productionHost(),original=state.host.registerCommand.bind(state.host);let attempts=0;
 state.host.registerCommand=(name:string,command:any)=>{if(++attempts===3)throw Error("injected command registration failure");original(name,command);};
 createPiExtension({enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false})(state.host as any);const bootstrap=state.events.get("session_start")![0]!;
 await bootstrap({},state.context());
 assert.equal(state.commands.size,2);assert.equal(state.tools.size,4);
 assert.match(state.messages.join("\n"),/partial registrations remain inert; reload Pi to recover/);
 const first=[...state.commands.values()][0];await assert.rejects(first.handler("",state.context()),/disabled after an incomplete host setup/);
 await bootstrap({},state.context());assert.equal(attempts,3,"partial registrations are not duplicated on a later session");
});

test("command and tool collisions stop every registration before host mutation",async()=>{
 for(const state of [productionHost([{name:"asen"}]),productionHost([],[{name:"asen_ask_choice"}])]){
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

test("public mode and UI context getters are supported",()=>{
 const context=Object.defineProperties({}, {mode:{get:()=>"rpc"},hasUI:{get:()=>true}});
 assert.doesNotThrow(()=>validatePiExecutionContext(context));
});

test("missing or incomplete initialized inventories fail closed",async()=>{
 const missing=productionHost();(missing.host as any).getAllTools=undefined;
 assert.throws(()=>asen(missing.host as any),/callable Pi getAllTools/);
 assert.equal(missing.commands.size,0);
 const incomplete=productionHost(new Array(1));asen(incomplete.host as any);
 await incomplete.events.get("session_start")![0]!({},incomplete.context());
 assert.equal(incomplete.commands.size,0);assert.match(incomplete.messages.join("\n"),/inventory/);
});
