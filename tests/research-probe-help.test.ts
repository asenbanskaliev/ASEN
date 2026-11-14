import assert from "node:assert/strict";
import {test,type TestContext} from "node:test";
import {mkdir,mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createAsenExtension} from "../extensions/asen.js";

const usage="Research probe is disabled by default; enterprise use requires `--url <absolute HTTP or HTTPS URL> [--execute]` and remains read-only diagnostics.";
async function fixture(t:TestContext){
 const root=await mkdtemp(path.join(os.tmpdir(),"asen-probe-help-"));
 const home=path.join(root,"home"),project=path.join(root,"project");
 const originalFetch=globalThis.fetch,calls:{url:unknown;options:unknown}[]=[],notices:unknown[][]=[];
 const commands=new Map<string,any>(),events=new Map<string,Function[]>();
 const forbidden=()=>assert.fail("Unexpected SDK/model/host execution");
 const ctx={cwd:project,hasUI:false,sessionManager:{getSessionId:()=>"probe-help"},ui:{notify(...value:unknown[]){notices.push(value);}}};
 t.after(async()=>{
  try{for(const fn of events.get("session_shutdown")??[])await fn({},ctx);}
  finally{globalThis.fetch=originalFetch;await rm(root,{recursive:true,force:true});}
 });
 await Promise.all([mkdir(home),mkdir(project)]);
 globalThis.fetch=async(url,options)=>{
  calls.push({url,options});return {status:204,statusText:"No Content"} as unknown as Response;
 };
 const pi={registerCommand(name:string,command:any){commands.set(name,command);},registerTool(){},registerShortcut(){},
  getCommands(){return [...commands].map(([name,command])=>({name,description:command.description,source:"extension"}));},
  getAllTools(){return [];},getFlag(){return false;},on(name:string,fn:Function){events.set(name,[...(events.get(name)??[]),fn]);},
  sendMessage:forbidden,sendUserMessage:forbidden,setModel:forbidden,setActiveTools:forbidden,exec:forbidden};
 createAsenExtension({homeDir:()=>home,packageRoot:root,registryLifecycle:{watch:()=>({close(){}})},
  autoAdvancePlans:false,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false})(pi as any);
 // Registration only: never emit session_start or open a real SDK/provider session.
 return {calls,notices,async call(args:string){notices.length=0;return await commands.get("asen-research-probe").handler(args,ctx);}};
}

test("public probe usage truthfully advertises both accepted URL protocols without making a request",async t=>{
 const f=await fixture(t);
 assert.deepEqual(await f.call(""),[usage]);
 assert.deepEqual(f.notices,[[usage,"info"]]);
 assert.deepEqual(f.calls,[]);
});

test("existing explicit HTTP/HTTPS probes keep one HEAD request with or without the legacy optional flag",async t=>{
 const f=await fixture(t);
 for(const protocol of ["http","https"]){
  for(const flag of [""," --execute"]){
   const url=`${protocol}://example.invalid/probe`,message=`Research probe HEAD ${url}: 204 No Content`;
   const previous=f.calls.length;
   assert.deepEqual(await f.call(`--url ${url}${flag}`),[message]);
   assert.deepEqual(f.notices,[[message,"info"]]);
   assert.equal(f.calls.length,previous+1);
   assert.deepEqual(f.calls.at(-1),{url,options:{method:"HEAD"}});
  }
 }
});
