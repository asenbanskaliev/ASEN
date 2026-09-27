import assert from "node:assert/strict";import test from "node:test";import {mkdtemp,writeFile} from "node:fs/promises";import {tmpdir} from "node:os";import {join} from "node:path";import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {issueSkillContext} from "../src/skills/context.js";
async function fixture(body:string){const d=await mkdtemp(join(tmpdir(),"asen-pi-")),p=join(d,"pi-fixture.mjs");await writeFile(p,body);return {d,p};}
function runner(p:string,options:ConstructorParameters<typeof PiProcessRunner>[0]={}){return new PiProcessRunner({command:process.execPath,rpcArgs:[],extraArgs:[p],...options});}
test("Pi RPC adapter correlates request id",async()=>{const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"response",id:f.id,command:"prompt",success:true,message:f.message}));});');const r=await runner(p,{validateResponseId:true}).run({id:"req-1",role:"explorer",prompt:"hello",repository:d});assert.equal(r.ok,true);assert.match(r.output,/req-1/);});
test("Pi child times out",async()=>{const {d,p}=await fixture("setTimeout(()=>{},10000);");const r=await runner(p,{timeoutMs:50}).run({id:"t",role:"explorer",prompt:"x",repository:d});assert.equal(r.ok,false);assert.match(r.output,/timed out/);});
test("Pi child output is bounded",async()=>{const {d,p}=await fixture('console.log("x".repeat(10000));');const r=await runner(p,{maxOutputBytes:100}).run({id:"o",role:"explorer",prompt:"x",repository:d});assert.equal(r.ok,false);assert.match(r.output,/exceeded/);});

test("Pi child can be cancelled explicitly",async()=>{const {d,p}=await fixture("setTimeout(()=>{},10000);");const controller=new AbortController();const pending=runner(p,{signal:controller.signal,timeoutMs:10000}).run({id:"cancel",role:"explorer",prompt:"x",repository:d});controller.abort();const r=await pending;assert.equal(r.ok,false);assert.match(r.output,/cancelled/);});

test("Pi cancellation terminates a spawned descendant",async()=>{const marker=join(tmpdir(),`asen-descendant-${process.pid}-${Date.now()}.txt`);const {d,p}=await fixture('import {spawn} from "node:child_process";import {writeFileSync} from "node:fs";const marker=process.argv[2];const c=spawn(process.execPath,["-e","setTimeout(()=>{},10000)"],{stdio:"ignore"});writeFileSync(marker,String(c.pid));setTimeout(()=>{},10000);');const controller=new AbortController();const pending=new PiProcessRunner({command:process.execPath,rpcArgs:[],extraArgs:[p,marker],signal:controller.signal,timeoutMs:10000}).run({id:"tree",role:"explorer",prompt:"x",repository:d});const {readFile}=await import("node:fs/promises");let pid=0;for(let i=0;i<40&&!pid;i++){try{pid=Number(await readFile(marker,"utf8"));}catch{}if(!pid)await new Promise(r=>setTimeout(r,25));}assert.ok(pid>0,"descendant pid was not recorded");controller.abort();const r=await pending;assert.equal(r.ok,false);assert.match(r.output,/cancelled/);await new Promise(r=>setTimeout(r,250));let alive=true;try{process.kill(pid,0);}catch{alive=false;}assert.equal(alive,false,`descendant ${pid} survived cancellation`);});

test("Pi RPC adapter rejects a mismatched response id",async()=>{const {d,p}=await fixture('console.log(JSON.stringify({type:"response",id:"other",command:"prompt",success:true}));');const r=await runner(p,{validateResponseId:true}).run({id:"req-expected",role:"explorer",prompt:"hello",repository:d});assert.equal(r.ok,false);assert.match(r.output,/correlated response missing/);});
test("Pi RPC adapter rejects malformed structured output",async()=>{const {d,p}=await fixture('console.log("not-json");');const r=await runner(p,{validateResponseId:true}).run({id:"req-json",role:"explorer",prompt:"hello",repository:d});assert.equal(r.ok,false);assert.match(r.output,/envelope invalid/);});
test("Pi RPC adapter requires a correlated response by default",async()=>{const {d,p}=await fixture('console.log(JSON.stringify({type:"event",id:"req-default"}));');const r=await runner(p).run({id:"req-default",role:"explorer",prompt:"hello",repository:d});assert.equal(r.ok,false);assert.match(r.output,/correlated response missing/);});

test("Pi RPC adapter injects exact issued skill paths before the task",async()=>{
 const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"response",id:f.id,success:true,message:f.message}));});');
 const r=await runner(p,{validateResponseId:true}).run({id:"skills",role:"explorer",prompt:"inspect this",repository:d,skillContext:issueSkillContext("skills",d,undefined,{phase:"explore"}),skillPaths:["skills/asen-phase-protocol/SKILL.md","skills/asen-explore/SKILL.md"]});
 assert.equal(r.ok,true);
 assert.match(r.output,/Load every SKILL\.md below before task-specific work/);
 assert.match(r.output,/skills\/asen-phase-protocol\/SKILL\.md/);
 assert.match(r.output,/skills\/asen-explore\/SKILL\.md/);
 assert.ok(r.output.indexOf("asen-explore/SKILL.md")<r.output.indexOf("inspect this"));
});
test("Pi RPC adapter rejects non-ASEN skill paths",async()=>{
 const {d,p}=await fixture('setTimeout(()=>{},10000);');
 const r=await runner(p).run({id:"bad-skill",role:"explorer",prompt:"x",repository:d,skillContext:issueSkillContext("bad-skill",d,undefined,{phase:"explore"}),skillPaths:["../other/SKILL.md"]});
 assert.equal(r.ok,false);
 assert.match(r.output,/do not match issued context/);
});
test("Pi RPC adapter rejects unissued skill injection",async()=>{
 const {d,p}=await fixture('setTimeout(()=>{},10000);');
 const r=await runner(p).run({id:"forged",role:"explorer",prompt:"x",repository:d,skillPaths:["skills/asen-explore/SKILL.md"]});
 assert.equal(r.ok,false);
 assert.match(r.output,/matching ASEN-issued context/);
});
test("Pi RPC adapter rejects omitted mandatory skill routes",async()=>{
 const {d,p}=await fixture('setTimeout(()=>{},10000);');
 const r=await runner(p).run({id:"omitted",role:"explorer",prompt:"x",repository:d,skillContext:issueSkillContext("omitted",d,undefined,{phase:"explore"}),skillPaths:[]});
 assert.equal(r.ok,false);
 assert.match(r.output,/do not match issued context/);
});
