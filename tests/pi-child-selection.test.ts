import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {mkdtemp,realpath,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import type {AgentRequest} from "../src/agents/dispatcher.js";

const marker="SECRET-STATE-MUST-NOT-LEAK";
const selected={model:{provider:"reported",id:"selected/model",headers:{Authorization:marker}},thinkingLevel:"low",sessionFile:marker,apiKey:marker,taskId:"foreign",sessionId:"foreign",source:"provider-used"};
async function fixture(t:TestContext,mode="valid",data:unknown=selected){
 const d=await realpath(await mkdtemp(join(tmpdir(),"asen-state-"))),p=join(d,"child.mjs");t.after(()=>rm(d,{recursive:true,force:true}));
 await writeFile(p,`const mode=${JSON.stringify(mode)},data=${JSON.stringify(data)};let buffer="",state,types=[];
const send=value=>process.stdout.write(JSON.stringify(value)+"\\n");
const reply=()=>send({type:"response",command:"get_state",id:mode==="mismatched"?"foreign-id":state.id,success:mode!=="unsupported",data});
process.stdin.on("data",chunk=>{buffer+=String(chunk);let end;while((end=buffer.indexOf("\\n"))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line)continue;const input=JSON.parse(line);types.push(input.type);
if(input.type==="get_commands"){const i=process.argv.indexOf("--extension");send({type:"response",command:"get_commands",id:input.id,success:true,data:{commands:[{name:"asen-authority-status",source:"extension",sourceInfo:{path:process.argv[i+1]}}]}});}
else if(input.type==="get_state"){state=input;if(mode!=="missing"&&mode!=="late"){reply();if(mode==="duplicate")reply();}}
else if(input.type==="prompt"){const m=process.argv.indexOf("--model"),h=process.argv.indexOf("--thinking");send({type:"response",command:"prompt",id:input.id,success:true,data:{types,model:process.argv[m+1],thinking:process.argv[h+1]}});send({type:"agent_end"});if(mode==="late"&&state)reply();}
}});`);
 return{d,runner:()=>new PiProcessRunner({command:process.execPath,rpcArgs:[],extraArgs:[p],policyRoot:fileURLToPath(new URL("..",import.meta.url)),timeoutMs:10000})};
}
const request=(repository:string,id="state-task",sessionId="state-session"):AgentRequest=>({id,role:"explorer",prompt:"Inspect only",repository,isolationKey:sessionId,model:"requested/model",thinking:"high"});
function subscribe(runner:PiProcessRunner,listener:(value:any)=>void):()=>void{const method=(runner as any).subscribeChildSelection;assert.equal(typeof method,"function","runner must expose optional child-selection observations");return method.call(runner,listener);}
function output(result:{id:string;ok:boolean;output:string},withState:boolean){
 assert.equal(result.ok,true,result.output);assert.deepEqual(Object.keys(result).sort(),["id","ok","output"]);assert.equal(result.output.includes(marker),false);assert.equal(result.output.includes('"command":"get_state"'),false);
 const records=result.output.trim().split(/\r?\n/u).map(line=>JSON.parse(line)),prompt=records.find(row=>row.type==="response"&&row.command==="prompt");assert.ok(prompt);assert.deepEqual(prompt.data.types,withState?["get_commands","get_state","prompt"]:["get_commands","prompt"]);assert.equal(prompt.data.model,"requested/model");assert.equal(prompt.data.thinking,"high");
}
test("child selection is opt-in and leaves unobserved prompt execution unchanged",async t=>{const f=await fixture(t),result=await f.runner().run(request(f.d));output(result,false);});
test("child selection emits one immutable sanitized report for the frozen owner",async t=>{
 const f=await fixture(t),runner=f.runner(),observed:any[]=[];subscribe(runner,event=>observed.push(event));const r=request(f.d),pending=runner.run(r);r.isolationKey="changed-after-launch";const result=await pending;output(result,true);
 assert.deepEqual([...observed],[{taskId:"state-task",sessionId:"state-session",projectId:f.d,source:"child-reported",model:{provider:"reported",id:"selected/model"},thinking:"low"}]);assert.equal(Object.isFrozen(observed[0]),true);assert.equal(Object.isFrozen(observed[0].model),true);assert.equal(JSON.stringify(observed).includes(marker),false);
});
test("child selection retains explicit default model and omits unavailable thinking",async t=>{const f=await fixture(t,"valid",{model:null}),runner=f.runner(),observed:any[]=[];subscribe(runner,value=>observed.push(value));output(await runner.run(request(f.d)),true);assert.deepEqual(observed,[{taskId:"state-task",sessionId:"state-session",projectId:f.d,source:"child-reported",model:null}]);});
test("child selection ignores bounded malformed unsupported and mismatched state without leaking it",async t=>{
 const scenarios:Array<[string,unknown]>=[["unsupported",selected],["mismatched",selected],["missing",selected],["valid",{model:{provider:"bad\u001b",id:"x"}}],["valid",{model:{provider:"reported",id:"x".repeat(257)}}],["valid",{model:{provider:"x".repeat(257),id:"x"}}],["valid",{model:{provider:"reported",id:"x"},thinkingLevel:"not-supported"}],["valid",{model:[],apiKey:marker}]];
 for(const [mode,data]of scenarios){const f=await fixture(t,mode,data),runner=f.runner(),observed:any[]=[];subscribe(runner,event=>observed.push(event));output(await runner.run(request(f.d)),true);assert.deepEqual(observed,[]);}
});
test("child selection admits boundary-length identifiers and only one duplicate response",async t=>{const data={model:{provider:"p".repeat(256),id:"m".repeat(256)},thinkingLevel:"off"},f=await fixture(t,"duplicate",data),runner=f.runner(),observed:any[]=[];subscribe(runner,event=>observed.push(event));output(await runner.run(request(f.d)),true);assert.equal(observed.length,1);assert.deepEqual(observed[0].model,data.model);assert.equal(observed[0].thinking,"off");});
test("child selection ignores state arriving after agent completion",async t=>{const f=await fixture(t,"late"),runner=f.runner(),observed:any[]=[];subscribe(runner,event=>observed.push(event));output(await runner.run(request(f.d)),true);assert.deepEqual(observed,[]);});
test("child selection keeps concurrent task session and project ownership separate",async t=>{
 const a=await fixture(t),b=await fixture(t),runner=a.runner(),observed:any[]=[];subscribe(runner,event=>observed.push(event));const results=await Promise.all([runner.run(request(a.d,"task-a","session-a")),runner.run(request(b.d,"task-b","session-b"))]);for(const result of results)output(result,true);
 assert.deepEqual(observed.map(({taskId,sessionId,projectId})=>({taskId,sessionId,projectId})).sort((x,y)=>x.taskId.localeCompare(y.taskId)),[{taskId:"task-a",sessionId:"session-a",projectId:a.d},{taskId:"task-b",sessionId:"session-b",projectId:b.d}]);
});
test("child selection unsubscribe and re-add cannot revive an earlier launch",async t=>{
 const f=await fixture(t),runner=f.runner(),observed:any[]=[],listener=(event:any)=>observed.push(event),unsubscribe=subscribe(runner,listener),pending=runner.run(request(f.d,"old-launch"));unsubscribe();const remove=subscribe(runner,listener);output(await pending,true);assert.deepEqual([...observed],[]);output(await runner.run(request(f.d,"new-launch")),true);assert.equal(observed.length,1);assert.equal(observed[0].taskId,"new-launch");remove();output(await runner.run(request(f.d,"without-observer")),false);assert.equal(observed.length,1);
});
test("child selection observer failures cannot change execution or other observers",async t=>{const f=await fixture(t),runner=f.runner(),observed:any[]=[];subscribe(runner,()=>{throw new Error("observer-only failure");});subscribe(runner,async()=>{throw new Error("async observer-only failure");});subscribe(runner,event=>observed.push(event));output(await runner.run(request(f.d)),true);assert.equal(observed.length,1);});
