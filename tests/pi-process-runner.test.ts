import assert from "node:assert/strict";import test from "node:test";import {mkdtemp,realpath,writeFile} from "node:fs/promises";import {tmpdir} from "node:os";import {join} from "node:path";import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {PiArtifactRunner} from "../src/agents/pi-artifact-runner.js";
import {SkillLifecycle} from "../src/lifecycle/skill-lifecycle.js";
import {Dispatcher} from "../src/agents/dispatcher.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
async function fixture(body:string,policy=true,skillsMode:"exact"|"missing"|"extra"|"altered"="exact"){
 const d=await realpath(await mkdtemp(join(tmpdir(),"asen-pi-"))),p=join(d,"pi-fixture.mjs"),scenario=join(d,"scenario.mjs");
 await writeFile(scenario,body);
 await writeFile(p,`import {spawn} from "node:child_process";
import {resolve} from "node:path";
const child=spawn(process.execPath,[${JSON.stringify(scenario)},...process.argv.slice(2)],{stdio:["pipe","pipe","pipe"]});
child.stdout.on("data",data=>process.stdout.write(data));child.stderr.on("data",data=>process.stderr.write(data));
let closed=null,prompted=false,buffer="";
child.on("close",code=>{closed=code??0;if(prompted)process.exit(closed);});
process.stdin.on("data",chunk=>{buffer+=String(chunk);let end;while((end=buffer.indexOf("\\n"))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;const record=JSON.parse(line);
if(record.type==="get_commands"){
const pos=process.argv.indexOf("--extension"),path=process.argv[pos+1];
const skills=process.argv.flatMap((arg,index,args)=>arg==="--skill"?[{name:"fixture",source:"skill",sourceInfo:{path:resolve(process.cwd(),args[index+1])}}]:[]);
const mode=${JSON.stringify(skillsMode)};
const loaded=mode==="missing"?[]:mode==="altered"?skills.map(item=>({...item,sourceInfo:{path:resolve(process.cwd(),"skills/asen-other/SKILL.md")}})):skills;
if(mode==="extra")loaded.push({name:"extra",source:"skill",sourceInfo:{path:resolve(process.cwd(),"skills/asen-extra/SKILL.md")}});
process.stdout.write(JSON.stringify({type:"response",id:record.id,success:true,data:{commands:[...${policy?"[{name:'asen-authority-status',source:'extension',sourceInfo:{path}}]":"[]"},...loaded]}})+"\\n");
}else{prompted=true;child.stdin.end(line+"\\n");if(closed!==null)process.exit(closed);}}});`);
 return {d,p};
}
function runner(p:string,options:ConstructorParameters<typeof PiProcessRunner>[0]={}){return new PiProcessRunner({command:process.execPath,rpcArgs:[],extraArgs:[p],...options});}
test("Pi RPC adapter correlates request id",async()=>{const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"response",id:f.id,command:"prompt",success:true,message:f.message}));});');const r=await runner(p,{validateResponseId:true}).run({id:"req-1",role:"explorer",prompt:"hello",repository:d});assert.equal(r.ok,true);assert.match(r.output,/req-1/);});
test("Pi artifact runner passes only a completed assistant JSON artifact to lifecycle",async()=>{
 const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"message_end",message:{role:"assistant",stopReason:"stop",content:[{type:"text",text:JSON.stringify({kind:"exploration-report",content:"inspected",repository:process.cwd(),candidateId:"c",revision:"r"})}]}}));console.log(JSON.stringify({type:"agent_end"}));console.log(JSON.stringify({type:"response",id:f.id,success:true}));});');
 const r=await new PiArtifactRunner(runner(p)).run({id:"task:explorer",role:"explorer",prompt:"inspect",repository:d});
 assert.equal(r.ok,true);assert.deepEqual(JSON.parse(r.output),{kind:"exploration-report",content:"inspected",repository:d,candidateId:"c",revision:"r"});
});
test("Pi RPC artifact advances one phase only with exact candidate output",async()=>{
 const source='let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"message_end",message:{role:"assistant",stopReason:"stop",content:[{type:"text",text:JSON.stringify({kind:"project-context",content:"context inspected",repository:process.cwd(),candidateId:"c",revision:"r"})}]}}));console.log(JSON.stringify({type:"agent_end"}));console.log(JSON.stringify({type:"response",id:f.id,success:true}));});';
 const {d,p}=await fixture(source),candidate={id:"c",repository:d,revision:"r",createdAt:"now"};
 const lifecycle=new SkillLifecycle("pi-task",candidate),ctx=issueSkillContext("pi-task:worker",d,candidate,{phase:"context-init"}),paths=selectSkills(ctx).map(x=>x.path);
 const evidence=new EvidenceStore(),dispatcher=new Dispatcher(new PiArtifactRunner(runner(p)),evidence);
 const state=await lifecycle.runPhase(dispatcher,{phase:"context-init",context:ctx,skillPaths:paths,prompt:"inspect context",evidence,risk:"low"});
 assert.equal(state.records.length,1);assert.equal(state.nextPhase,"explore");
});
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
test("Pi RPC adapter supplies selected routes as native Pi flags",async()=>{
 const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"response",id:f.id,success:true,args:process.argv.slice(2)}));});');
 const context=issueSkillContext("native",d,undefined,{phase:"explore"});
 const paths=selectSkills(context).map(skill=>skill.path);
 const r=await runner(p).run({id:"native",role:"explorer",prompt:"inspect",repository:d,skillContext:context,skillPaths:paths});
 assert.equal(r.ok,true);
 const response=JSON.parse(r.output.trim().split(/\r?\n/).at(-1)!);
 assert.deepEqual(response.args,["--no-extensions","--extension",join(d,"extensions/authority.ts"),"--no-skills","--tools","read",...paths.flatMap(path=>["--skill",path])]);
});
test("Pi worker receives bounded file tools without process execution or delegation",async()=>{
 const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"response",id:f.id,success:true,args:process.argv.slice(2)}));});');
 const candidate={id:"candidate",repository:d,revision:"revision",createdAt:"now"};
 const context=issueSkillContext("worker",d,candidate,{phase:"apply"});
 const paths=selectSkills(context).map(skill=>skill.path);
 const r=await runner(p).run({id:"worker",role:"worker",prompt:"implement",repository:d,candidate,writeSurfaces:["src"],skillContext:context,skillPaths:paths});
 assert.equal(r.ok,true);
 const args=JSON.parse(r.output.trim().split(/\r?\n/).at(-1)!).args as string[];
 assert.deepEqual(args,["--no-extensions","--extension",join(d,"extensions/authority.ts"),"--no-skills","--tools","read,edit,write",...paths.flatMap(path=>["--skill",path])]);
});
test("direct Pi runner refuses a candidate-bound turn without issued selection",async()=>{
 const candidate={id:"candidate",repository:"missing-repo",revision:"revision",createdAt:"now"};
 for(const role of ["explorer","reviewer","verifier","worker"] as const){
  const result=await new PiProcessRunner({command:"does-not-exist"}).run({id:"task:a",role,prompt:"inspect",repository:candidate.repository,candidate});
  assert.equal(result.ok,false);
  assert.match(result.output,/issued skill context and exact paths/);
 }
});
test("direct Pi runner rejects role phase substitution and writer authority outside apply",async()=>{
 const candidate={id:"candidate",repository:"missing-repo",revision:"revision",createdAt:"now"};
 const context=issueSkillContext("task:a",candidate.repository,candidate,{phase:"explore"});
 const skillPaths=selectSkills(context).map(item=>item.path);
 for(const role of ["reviewer","verifier"] as const){
  const result=await new PiProcessRunner({command:"does-not-exist"}).run({id:"task:a",role,prompt:"inspect",repository:candidate.repository,candidate,skillContext:context,skillPaths});
  assert.equal(result.ok,false);assert.match(result.output,/agent role/);
 }
 const writer=await new PiProcessRunner({command:"does-not-exist"}).run({id:"task:a",role:"worker",prompt:"write",repository:candidate.repository,candidate,skillContext:context,skillPaths,writeSurfaces:["src"]});
 assert.equal(writer.ok,false);assert.match(writer.output,/apply phase/);
});
test("Pi preflight rejects omitted, added or replaced native Skill routes",async()=>{
 for(const mode of ["missing","extra","altered"] as const){
  const {d,p}=await fixture("setTimeout(()=>{},10000);",true,mode);
  const context=issueSkillContext("skill-drift",d,undefined,{phase:"explore"});
  const result=await runner(p).run({id:"skill-drift",role:"explorer",prompt:"inspect",repository:d,skillContext:context,skillPaths:selectSkills(context).map(item=>item.path)});
  assert.equal(result.ok,false,mode);assert.match(result.output,/native Skill paths do not match/,mode);
 }
});
test("Pi runner refuses to prompt without its authority extension",async()=>{
 const {d,p}=await fixture('setTimeout(()=>{},10000);',false);
 const r=await runner(p).run({id:"no-policy",role:"explorer",prompt:"read",repository:d});
 assert.equal(r.ok,false);assert.match(r.output,/policy extension was not loaded/);
});
test("Pi RPC adapter blocks caller-supplied tool authority",async()=>{
 const {d,p}=await fixture('setTimeout(()=>{},10000);');
 const context=issueSkillContext("tool-override",d,undefined,{phase:"explore"});
 const r=await runner(p,{extraArgs:[p,"--tools","bash"]}).run({id:"tool-override",role:"explorer",prompt:"inspect",repository:d,skillContext:context,skillPaths:selectSkills(context).map(skill=>skill.path)});
 assert.equal(r.ok,false);assert.match(r.output,/issued by ASEN/);
});
test("Pi RPC adapter rejects option terminators that disable ASEN flags",async()=>{
 const {d,p}=await fixture('setTimeout(()=>{},10000);');
 const context=issueSkillContext("terminator",d,undefined,{phase:"explore"});
 const r=await runner(p,{extraArgs:[p,"--"]}).run({id:"terminator",role:"explorer",prompt:"inspect",repository:d,skillContext:context,skillPaths:selectSkills(context).map(skill=>skill.path)});
 assert.equal(r.ok,false);assert.match(r.output,/issued by ASEN/);
});
test("Pi RPC adapter blocks caller-supplied skill overrides",async()=>{
 const {d,p}=await fixture('setTimeout(()=>{},10000);');
 const context=issueSkillContext("override",d,undefined,{phase:"explore"});
 const r=await runner(p,{extraArgs:[p,"--skill","skills/asen-review/SKILL.md"]}).run({id:"override",role:"explorer",prompt:"inspect",repository:d,skillContext:context,skillPaths:selectSkills(context).map(skill=>skill.path)});
 assert.equal(r.ok,false);assert.match(r.output,/issued by ASEN/);
});
