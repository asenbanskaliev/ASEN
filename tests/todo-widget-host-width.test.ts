import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {createAsenExtension} from "../extensions/asen.js";
import {hostContentColumns,visibleWidth} from "../src/runtime/responsive-layout.js";
import type {TodoItem} from "../src/runtime/todo-store.js";

async function fixture(t:TestContext){
 const root=`${process.cwd()}/.cache/todo-widget-width-${process.pid}-${Date.now()}`,home=`${root}/home`,project=process.cwd();
 const env={HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:`${root}/config`,XDG_CACHE_HOME:`${root}/cache`,XDG_DATA_HOME:`${root}/data`,TMPDIR:`${root}/tmp`,TMP:`${root}/tmp`,TEMP:`${root}/tmp`,ASEN_NO_SKILL_REGISTRY:"1"};
 for(const [key,value] of Object.entries(env)){const prior=process.env[key];process.env[key]=value;t.after(()=>{if(prior===undefined)delete process.env[key];else process.env[key]=prior;});}
 const item=(taskId:string,title:string,state:"planned"|"running"|"blocked",role:"explorer"|"worker"|"verifier"):TodoItem&{current:TodoItem["events"][number]}=>{
  const current={taskId,sessionId:"todo-width-session",projectId:project,revision:3,state,at:"2026-11-06T00:00:00.000Z",...(state==="blocked"?{reason:"Private blocked reason"}:{})} as TodoItem["events"][number];
  return {taskId,title,requestId:`request-${taskId}`,dependsOn:[`dependency-${taskId}`],events:[current],current,plan:{role,skillPaths:[]}};
 };
 const rows=[
  item("private-task-cjk","界".repeat(60),"running","explorer"),
  item("private-task-emoji","👨‍👩‍👧‍👦".repeat(30),"blocked","worker"),
  item("private-task-control","ASCII remains visible \u001b[31m\n\u202e"+"x".repeat(80),"planned","verifier"),
 ];
 const before=structuredClone(rows);let listReads=0,recoverCalls=0;
 const store={async recover(){recoverCalls++;},diagnostics(){return undefined;},async list(){listReads++;return rows;}};
 const events=new Map<string,Function[]>(),widgets=new Map<string,string[]|undefined>(),commands=new Map<string,any>();
 const pi={registerCommand(name:string,command:any){commands.set(name,command);},registerTool(){},getAllTools(){return [];},getFlag(){return false;},on(name:string,handler:Function){events.set(name,[...(events.get(name)??[]),handler]);}};
 const context:any={cwd:project,mode:"tui",hasUI:true,sessionManager:{getSessionId:()=>"todo-width-session"},ui:{notify(){},setStatus(){},setWidget(key:string,value:string[]|undefined){widgets.set(key,value);}}};
 createAsenExtension({homeDir:()=>home,packageRoot:root,registryLifecycle:{watch:()=>({close(){}})},autoAdvancePlans:false,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false,todoStoreFactory:async()=>store as any})(pi as any);
 const emit=async(name:string,event:unknown={})=>{for(const handler of events.get(name)??[])await handler(event,context);};
 t.after(async()=>emit("session_shutdown"));
 return {before,rows,widgets,emit,reads:()=>listReads,recoverCalls:()=>recoverCalls};
}

function setTerminalColumns(t:TestContext,columns:number){
 const descriptor=Object.getOwnPropertyDescriptor(process.stdout,"columns");
 Object.defineProperty(process.stdout,"columns",{configurable:true,value:columns});
 t.after(()=>{if(descriptor)Object.defineProperty(process.stdout,"columns",descriptor);else delete (process.stdout as {columns?:number}).columns;});
}

test("public Todo widget registration uses the actual host content width without mutating Todo input",async t=>{
 const f=await fixture(t);setTerminalColumns(t,48);
 await f.emit("session_start");
 const wide=f.widgets.get("asen-todo-progress");assert.ok(wide);
 assert.ok(wide.every(row=>visibleWidth(row)<=hostContentColumns(48)),wide.join("\n"));
 assert.match(wide.join("\n"),/ASCII remains visi/u);
 assert.doesNotMatch(wide.join("\n"),/private-task|request-private|dependency-private/u);
 assert.ok(wide.every(row=>!/[\u0000-\u001f\u007f-\u009f\u202e]/u.test(row)));

 Object.defineProperty(process.stdout,"columns",{configurable:true,value:10});
 await f.emit("tool_execution_start",{toolName:"bash",toolCallId:"validation-width",args:{command:"npm test"}});
 const narrow=f.widgets.get("asen-todo-progress");assert.ok(narrow);
 assert.ok(narrow.every(row=>visibleWidth(row)<=hostContentColumns(10)),narrow.join("\n"));
 assert.doesNotMatch(narrow.join("\n"),/private-task|request-private|dependency-private/u);
 assert.ok(narrow.every(row=>!/[\u0000-\u001f\u007f-\u009f\u202e]/u.test(row)));
 assert.deepEqual(f.rows,f.before,"read-only widget rendering must preserve titles, states, revisions and storage fields");
 assert.equal(f.recoverCalls(),1);assert.ok(f.reads()>=2,"startup and validation refreshes should read the owned Todo source");
});
