import test from "node:test";
import assert from "node:assert/strict";
import {BackgroundJobRegistry} from "../src/runtime/background-jobs.js";
import {registerBackgroundJobTools} from "../src/runtime/background-job-tools.js";

test("registers public background start/status/stop tools with session ownership",async()=>{
 const tools=new Map<string,any>(),registry=new BackgroundJobRegistry(undefined,async(_command,_cwd,{signal})=>new Promise(resolve=>signal.addEventListener("abort",()=>resolve({exitCode:null}),{once:true})));registerBackgroundJobTools({registerTool(tool:any){tools.set(tool.name,tool);}},registry);
 const startTool=tools.get("asen_background_start");assert.equal(startTool.parameters.additionalProperties,false);assert.equal(Object.hasOwn(startTool.parameters.properties,"args"),false);
 const host={cwd:process.cwd(),sessionManager:{getSessionId:()=>"s1"}};await assert.rejects(()=>startTool.execute("monitor-missing-timeout",{command:"npm test",monitor:true},undefined,undefined,host),/requires timeoutMs/);
 const start=await startTool.execute("1",{command:"npm test",timeoutMs:10000},undefined,undefined,host);const job=JSON.parse(start.content[0].text);assert.equal(job.sessionId,"s1");
 const status=await tools.get("asen_background_status").execute("2",{},undefined,undefined,host);assert.equal(JSON.parse(status.content[0].text).length,1);
 const stopped=await tools.get("asen_background_stop").execute("3",{id:job.id},undefined,undefined,host);assert.equal(JSON.parse(stopped.content[0].text).state,"stopped");
 await new Promise(resolve=>setTimeout(resolve,25));
});

