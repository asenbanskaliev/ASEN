import assert from "node:assert/strict";import test from "node:test";import {execFile} from "node:child_process";import {access,copyFile,mkdir,mkdtemp,readdir,realpath,rm,writeFile} from "node:fs/promises";import {tmpdir} from "node:os";import {join} from "node:path";import {fileURLToPath} from "node:url";import {PiProcessRunner,piRuntimeEnvironment} from "../src/agents/pi-process-runner.js";
import {PiArtifactRunner} from "../src/agents/pi-artifact-runner.js";
import {createTestSkillLifecycle} from "./helpers/lifecycle-applicability.js";
import {Dispatcher} from "../src/agents/dispatcher.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {createAgentLifecycleSink} from "../src/runtime/agent-lifecycle.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
type PosixProcessObservation={exitCode:number;stdout:string;stderr:string};
function isLivePosixProcess(pid:number,{exitCode,stdout,stderr}:PosixProcessObservation){
 const state=stdout.trim(),errorOutput=stderr.trim();
 if(exitCode===0){
  if(errorOutput)throw new Error(`ps could not observe process ${pid} (exit 0: ${errorOutput})`);
  if(!state)throw new Error(`ps returned no state for process ${pid}`);
  if(!/^[DIRSTtWXZ](?:<|N)?L?s?l?\+?$/.test(state))throw new Error(`ps returned invalid state for process ${pid}`);
  return state[0]!=="Z";
 }
 if(exitCode===1&&!state&&!errorOutput)return false;
 throw new Error(`ps could not observe process ${pid} (exit ${exitCode}${errorOutput?`: ${errorOutput}`:""})`);
}
async function isLiveProcess(pid:number){
 if(process.platform==="win32"){try{process.kill(pid,0);return true;}catch{return false;}}
 const observation=await new Promise<PosixProcessObservation>((resolve,reject)=>{
  execFile("ps",["-o","stat=","-p",String(pid)],{timeout:1000},(error,stdout,stderr)=>{
   if(!error)return resolve({exitCode:0,stdout,stderr});
   if(typeof error.code==="number")return resolve({exitCode:error.code,stdout,stderr});
   reject(error);
  });
 });
 return isLivePosixProcess(pid,observation);
}
async function fixture(body:string,policy=true,skillsMode:"exact"|"missing"|"extra"|"altered"="exact"){
 const d=await realpath(await mkdtemp(join(tmpdir(),"asen-pi-"))),p=join(d,"pi-fixture.mjs"),scenario=join(d,"scenario.mjs");
 await mkdir(join(d,"extensions"));await copyFile(fileURLToPath(new URL("../extensions/authority.ts",import.meta.url)),join(d,"extensions/authority.ts"));
 for(const source of ["src/runtime/workspace-store.ts","src/runtime/workspace-attribution.ts","src/io/atomic-write.ts","src/io/exclusive-file-lock.ts","src/io/private-file.ts"]){const target=join(d,source);await mkdir(target.slice(0,target.lastIndexOf("/")),{recursive:true});await copyFile(fileURLToPath(new URL(`../${source}`,import.meta.url)),target);}
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
test("Pi RPC adapter correlates request id",async()=>{const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"response",id:f.id,command:"prompt",success:true,message:f.message}));});');const r=await runner(p,{}).run({id:"req-1",role:"explorer",prompt:"hello",repository:d});assert.equal(r.ok,true);assert.match(r.output,/req-1/);});
test("Pi child receives an operational environment and only the explicitly selected provider credential",async t=>{
 const names=["ASEN_TEST_UNRELATED_SECRET","OPENROUTER_API_KEY","GROQ_API_KEY"] as const,previous=names.map(name=>process.env[name]);
 process.env.ASEN_TEST_UNRELATED_SECRET="must-not-cross";process.env.OPENROUTER_API_KEY="selected-test-credential";process.env.GROQ_API_KEY="unselected-test-credential";
 t.after(()=>names.forEach((name,index)=>{const value=previous[index];if(value===undefined)delete process.env[name];else process.env[name]=value;}));
 const {d,p}=await fixture('let x="";process.stdin.on("data",chunk=>x+=chunk);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"response",id:f.id,success:true,environment:{path:typeof process.env.PATH==="string",home:typeof process.env.HOME==="string"||typeof process.env.USERPROFILE==="string",telemetry:process.env.PI_TELEMETRY,selected:process.env.OPENROUTER_API_KEY==="selected-test-credential",unselected:typeof process.env.GROQ_API_KEY==="string",unrelated:typeof process.env.ASEN_TEST_UNRELATED_SECRET==="string"}}));});');
 const result=await runner(p,{providerCredential:"OPENROUTER_API_KEY"}).run({id:"env-isolation",role:"explorer",prompt:"inspect",repository:d});assert.equal(result.ok,true);const response=JSON.parse(result.output.trim().split(/\r?\n/u).at(-1)!);assert.deepEqual(response.environment,{path:typeof process.env.PATH==="string",home:typeof process.env.HOME==="string"||typeof process.env.USERPROFILE==="string",telemetry:"0",selected:true,unselected:false,unrelated:false});
});
test("Pi runtime environment allowlist preserves Windows names without copying ambient secrets",()=>{const env=piRuntimeEnvironment({PATH:"C:\\bin",USERPROFILE:"C:\\Users\\test",GROQ_API_KEY:"secret",OPENROUTER_API_KEY:"chosen"},"OPENROUTER_API_KEY","win32");assert.equal(env.PATH,"C:\\bin");assert.equal(env.USERPROFILE,"C:\\Users\\test");assert.equal(env.OPENROUTER_API_KEY,"chosen");assert.equal(env.GROQ_API_KEY,undefined);assert.equal(env.PI_TELEMETRY,"0");assert.throws(()=>piRuntimeEnvironment({ASEN_TEST_SECRET:"do-not-copy"},"ASEN_TEST_SECRET" as never),/Unsupported Pi provider credential/);});
test("Pi runner refuses a candidate-supplied replacement authority extension",async()=>{
 const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"response",id:f.id,success:true}));});');
 await writeFile(join(d,"extensions/authority.ts"),'export default pi => pi.registerCommand("asen-authority-status", {handler: async () => {}});');
 const result=await runner(p).run({id:"tampered",role:"explorer",prompt:"inspect",repository:d});
 assert.equal(result.ok,false);assert.match(result.output,/authority extension integrity/);
});
test("Pi runner loads policy from the configured ASEN package root, not the project",async()=>{
 const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"response",id:f.id,success:true,message:f.message}));});');
 const policyRoot=fileURLToPath(new URL("..",import.meta.url));await rm(join(d,"extensions/authority.ts"),{force:true});
 const result=await runner(p,{policyRoot}).run({id:"package-policy",role:"explorer",prompt:"inspect",repository:d});assert.equal(result.ok,true);assert.match(result.output,/package-policy/);
});
test("Pi rejects an untrusted provider extension without leaking a policy directory",async t=>{
 const {d,p}=await fixture('setTimeout(()=>{},10000);');
 const policyDirectories=async()=>new Set((await readdir(tmpdir(),{withFileTypes:true})).filter(entry=>entry.isDirectory()&&entry.name.startsWith("asen-policy-")).map(entry=>entry.name));
 const before=await policyDirectories();
 const result=await runner(p,{providerExtension:"file:untrusted-provider.ts"}).run({id:"untrusted-provider",role:"explorer",prompt:"inspect",repository:d});
 const leaked=[...(await policyDirectories())].filter(name=>!before.has(name));
 t.after(()=>Promise.all(leaked.map(name=>rm(join(tmpdir(),name),{recursive:true,force:true}))));
 assert.equal(result.ok,false);assert.match(result.output,/untrusted Pi provider extension/);
 assert.deepEqual(leaked,[]);
});
test("Pi policy digest accepts Windows checkout line endings",async()=>{
 const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"response",id:f.id,success:true}));});');
 const {readFile}=await import("node:fs/promises"),path=join(d,"extensions/authority.ts");
 await writeFile(path,(await readFile(path,"utf8")).replace(/\r?\n/g,"\r\n"));
 const result=await runner(p).run({id:"crlf",role:"explorer",prompt:"inspect",repository:d});
 assert.equal(result.ok,true);
});
test("Pi loads a pinned policy copy even when candidate policy changes after preflight",async()=>{
 const {d,p}=await fixture('import {readFileSync,writeFileSync} from "node:fs";let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim()),path=process.argv[process.argv.indexOf("--extension")+1];writeFileSync("extensions/authority.ts","malicious replacement");console.log(JSON.stringify({type:"response",id:f.id,success:true,policySource:readFileSync(path,"utf8")}));});');
 const result=await runner(p).run({id:"race",role:"explorer",prompt:"inspect",repository:d});
 assert.equal(result.ok,true);
 const response=JSON.parse(result.output.trim().split(/\r?\n/).at(-1)!);
 assert.match(response.policySource,/authorizeToolCall/);
});
test("Pi artifact runner passes only a completed assistant JSON artifact to lifecycle",async()=>{
 const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"message_end",message:{role:"assistant",stopReason:"stop",content:[{type:"text",text:JSON.stringify({kind:"exploration-report",content:"inspected",repository:process.cwd(),candidateId:"c",revision:"r"})}]}}));console.log(JSON.stringify({type:"agent_end"}));console.log(JSON.stringify({type:"response",id:f.id,success:true}));});');
 const candidate={id:"c",repository:d,revision:"r",createdAt:"now"};
 const r=await new PiArtifactRunner(runner(p)).run({id:"task:explorer",role:"explorer",prompt:"inspect",repository:d,candidate,skillContext:issueSkillContext("task:explorer",d,candidate,{phase:"explore"}),skillPaths:["skills/asen-phase-protocol/SKILL.md","skills/asen-explore/SKILL.md"]});
 assert.equal(r.ok,true);assert.deepEqual(JSON.parse(r.output),{kind:"exploration-report",content:"inspected",repository:d,candidateId:"c",revision:"r"});
});
test("Pi RPC artifact advances one phase only with exact candidate output",async()=>{
 const source='let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"message_end",message:{role:"assistant",stopReason:"stop",content:[{type:"text",text:JSON.stringify({kind:"project-context",content:"context inspected",repository:process.cwd(),candidateId:"c",revision:"r"})}]}}));console.log(JSON.stringify({type:"agent_end"}));console.log(JSON.stringify({type:"response",id:f.id,success:true}));});';
 const {d,p}=await fixture(source),candidate={id:"c",repository:d,revision:"r",createdAt:"now"};
 const lifecycle=await createTestSkillLifecycle("pi-task",candidate),ctx=issueSkillContext("pi-task:worker",d,candidate,{phase:"context-init"}),paths=selectSkills(ctx).map(x=>x.path);
 const evidence=new EvidenceStore(),dispatcher=new Dispatcher(new PiArtifactRunner(runner(p)),evidence);
 const state=await lifecycle.runPhase(dispatcher,{phase:"context-init",context:ctx,skillPaths:paths,prompt:"inspect context",evidence,risk:"low"});
 assert.equal(state.records.length,1);assert.equal(state.nextPhase,"explore");
});
test("Pi child times out",async()=>{const {d,p}=await fixture("setTimeout(()=>{},10000);");const r=await runner(p,{timeoutMs:50}).run({id:"t",role:"explorer",prompt:"x",repository:d});assert.equal(r.ok,false);assert.match(r.output,/timed out/);});
test("Pi child output is bounded",async()=>{const {d,p}=await fixture('console.log("x".repeat(10000));');const r=await runner(p,{maxOutputBytes:100}).run({id:"o",role:"explorer",prompt:"x",repository:d});assert.equal(r.ok,false);assert.match(r.output,/exceeded/);});

test("Dispatcher cancellation reaches Pi and records a cancelled terminal state",async()=>{
 const {d,p}=await fixture("setTimeout(()=>{},10000);");const lifecycle=createAgentLifecycleSink(),dispatcher=new Dispatcher(runner(p,{timeoutMs:10000}),new EvidenceStore(),1,lifecycle);
 const pending=dispatcher.dispatch({id:"cancel",role:"explorer",prompt:"x",repository:d});
 for(let i=0;i<100&&lifecycle.snapshot()[0]?.state!=="running";i++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(lifecycle.snapshot()[0]?.state,"running");assert.equal(dispatcher.cancel("cancel","default",d),true);
 const r=await pending;assert.equal(r.ok,false);assert.match(r.output,/cancellation requested/i);assert.equal(lifecycle.snapshot()[0]?.state,"cancelled");
});

test("Pi child errors cannot replace an already requested cancellation",async()=>{
 const {d}=await fixture("setTimeout(()=>{},10000);");
 const controller=new AbortController();controller.abort();
 const result=await new PiProcessRunner({command:join(d,"missing-pi-command"),signal:controller.signal,timeoutMs:10000}).run({id:"cancel-error",role:"explorer",prompt:"x",repository:d});
 assert.equal(result.ok,false);assert.match(result.output,/cancelled/);
});

test("POSIX process-state observation distinguishes live, zombie, and absent processes",()=>{
 assert.equal(isLivePosixProcess(101,{exitCode:0,stdout:"R+\n",stderr:""}),true);
 assert.equal(isLivePosixProcess(102,{exitCode:0,stdout:"Z\n",stderr:""}),false);
 assert.equal(isLivePosixProcess(103,{exitCode:0,stdout:"Z+\n",stderr:""}),false);
 assert.equal(isLivePosixProcess(104,{exitCode:0,stdout:"S<sl+\n",stderr:""}),true);
 assert.equal(isLivePosixProcess(105,{exitCode:1,stdout:"",stderr:""}),false);
 assert.throws(()=>isLivePosixProcess(106,{exitCode:1,stdout:"",stderr:"permission denied"}),/could not observe/);
 assert.throws(()=>isLivePosixProcess(107,{exitCode:0,stdout:"",stderr:""}),/no state/);
});

test("POSIX process-state observation fails closed on invalid ps output",()=>{
 assert.throws(()=>isLivePosixProcess(201,{exitCode:0,stdout:"ZOMBIE\n",stderr:""}),/invalid state/);
 assert.throws(()=>isLivePosixProcess(202,{exitCode:0,stdout:"Z\nR+\n",stderr:""}),/invalid state/);
 assert.throws(()=>isLivePosixProcess(203,{exitCode:0,stdout:"?\n",stderr:""}),/invalid state/);
 assert.throws(()=>isLivePosixProcess(204,{exitCode:0,stdout:"Z\n",stderr:"warning"}),/could not observe/);
});

test("Pi cancellation settles its process tree and policy cleanup before returning",async t=>{
 const marker=join(tmpdir(),`asen-descendant-${process.pid}-${Date.now()}.json`);t.after(()=>rm(marker,{force:true}));
 const {d,p}=await fixture('import {spawn} from "node:child_process";import {writeFileSync} from "node:fs";const marker=process.argv[2],policy=process.argv[process.argv.indexOf("--extension")+1];const c=spawn(process.execPath,["-e","setTimeout(()=>{},10000)"],{stdio:"ignore"});writeFileSync(marker,JSON.stringify({pid:c.pid,policy}));setTimeout(()=>{},10000);');
 const controller=new AbortController();
 const pending=new PiProcessRunner({command:process.execPath,rpcArgs:[],extraArgs:[p,marker],signal:controller.signal,timeoutMs:10000}).run({id:"tree",role:"explorer",prompt:"x",repository:d});
 const {readFile}=await import("node:fs/promises");let state:{pid:number;policy:string}|undefined;
 for(let i=0;i<40&&!state;i++){try{state=JSON.parse(await readFile(marker,"utf8"));}catch{/* Marker not written yet. */}if(!state)await new Promise(r=>setTimeout(r,25));}
 assert.ok(state,"descendant and policy paths were not recorded");
 controller.abort();const result=await pending;
 assert.equal(result.ok,false);assert.match(result.output,/cancelled/);
 await assert.rejects(()=>access(state.policy),error=>(error as NodeJS.ErrnoException).code==="ENOENT");
 assert.equal(await isLiveProcess(state.pid),false,`descendant ${state.pid} survived cancellation settlement`);
});

test("Pi RPC adapter rejects a mismatched response id",async()=>{const {d,p}=await fixture('console.log(JSON.stringify({type:"response",id:"other",command:"prompt",success:true}));');const r=await runner(p,{}).run({id:"req-expected",role:"explorer",prompt:"hello",repository:d});assert.equal(r.ok,false);assert.match(r.output,/correlated response missing/);});
test("Pi RPC correlation cannot be disabled by a runner option",async()=>{
 const {d,p}=await fixture('console.log(JSON.stringify({type:"response",id:"other",success:true}));');
 const result=await runner(p,{validateResponseId:false} as ConstructorParameters<typeof PiProcessRunner>[0]).run({id:"required",role:"explorer",prompt:"hello",repository:d});
 assert.equal(result.ok,false);assert.match(result.output,/correlated response missing/);
});
test("Pi RPC runner rejects duplicate correlated responses",async()=>{
 const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());for(let i=0;i<2;i++)console.log(JSON.stringify({type:"response",id:f.id,success:true}));});');
 const result=await runner(p).run({id:"duplicate",role:"explorer",prompt:"hello",repository:d});
 assert.equal(result.ok,false);assert.match(result.output,/exactly one correlated response/);
});
test("Pi RPC runner requires an explicit successful correlated response",async()=>{
 const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"response",id:f.id}));});');
 const result=await runner(p).run({id:"missing-success",role:"explorer",prompt:"hello",repository:d});
 assert.equal(result.ok,false);assert.match(result.output,/response failed/);
});
test("Pi failures never return model content or child stderr",async()=>{
 const marker="PRIVATE_MODEL_CONTENT";
 const failed=await fixture(`let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"response",id:f.id,success:false,error:${JSON.stringify(marker)}}));});`);
 const response=await runner(failed.p).run({id:"failed",role:"explorer",prompt:"hello",repository:failed.d});
 assert.equal(response.ok,false);assert.ok(!response.output.includes(marker));
 const crashed=await fixture(`console.error(${JSON.stringify(marker)});process.exit(7);`);
 const failure=await runner(crashed.p).run({id:"crashed",role:"explorer",prompt:"hello",repository:crashed.d});
 assert.equal(failure.ok,false);assert.ok(!failure.output.includes(marker));
});
test("Pi RPC adapter rejects malformed structured output",async()=>{const {d,p}=await fixture('console.log("not-json");');const r=await runner(p,{}).run({id:"req-json",role:"explorer",prompt:"hello",repository:d});assert.equal(r.ok,false);assert.match(r.output,/envelope invalid/);});
test("Pi RPC adapter requires a correlated response by default",async()=>{const {d,p}=await fixture('console.log(JSON.stringify({type:"event",id:"req-default"}));');const r=await runner(p).run({id:"req-default",role:"explorer",prompt:"hello",repository:d});assert.equal(r.ok,false);assert.match(r.output,/correlated response missing/);});

test("Pi RPC adapter injects exact issued skill paths before the task",async()=>{
 const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"response",id:f.id,success:true,message:f.message}));});');
 const r=await runner(p,{}).run({id:"skills",role:"explorer",prompt:"inspect this",repository:d,skillContext:issueSkillContext("skills",d,undefined,{phase:"explore"}),skillPaths:["skills/asen-phase-protocol/SKILL.md","skills/asen-explore/SKILL.md"]});
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
 assert.match(response.args[2],/[\\/]asen-policy-[^\\/]+[\\/]extensions[\\/]authority\.ts$/);
 assert.deepEqual([response.args[0],response.args[1],...response.args.slice(3)],["--no-extensions","--extension","--no-skills","--tools","read",...paths.flatMap(path=>["--skill",path])]);
});
test("read-only artifact audit disables every Pi tool",async()=>{
 const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"response",id:f.id,success:true,args:process.argv.slice(2)}));});');
 const context=issueSkillContext("audit",d,undefined,{phase:"explore"});
 const r=await runner(p,{noTools:true}).run({id:"audit",role:"explorer",prompt:"artifact",repository:d,skillContext:context,skillPaths:selectSkills(context).map(skill=>skill.path)});
 assert.equal(r.ok,true);
 const args=JSON.parse(r.output.trim().split(/\r?\n/).at(-1)!).args as string[];
 assert.ok(args.includes("--no-tools"));assert.ok(!args.includes("--tools"));
});
test("read-only Pi runner fails closed when a model attempts a tool",{timeout:process.platform==="win32"?15_000:5_000},async t=>{
 const marker=join(tmpdir(),`asen-denied-tool-${process.pid}-${Date.now()}`);t.after(()=>rm(marker,{force:true}));
 const {d,p}=await fixture(`import {writeFileSync} from "node:fs";const marker=${JSON.stringify(marker)};let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{JSON.parse(x.trim());console.log(JSON.stringify({type:"tool_execution_start",toolName:"write",toolCallId:"forbidden"}));setTimeout(()=>writeFileSync(marker,"tool side effect"),1500);});`);
 await new Promise<void>(resolve=>{const control=execFile(process.execPath,[p],{timeout:4_000},()=>resolve());control.stdin?.end('{"id":"positive-control"}\n');});
 await assert.doesNotReject(()=>access(marker),"positive control did not write the side-effect marker");
 await rm(marker,{force:true});
 const context=issueSkillContext("blocked-tool",d,undefined,{phase:"explore"});
 const timeoutMs=process.platform==="win32"?10_000:1_000;
 const result=await runner(p,{noTools:true,timeoutMs}).run({id:"blocked-tool",role:"explorer",prompt:"inspect",repository:d,skillContext:context,skillPaths:selectSkills(context).map(skill=>skill.path)});
 assert.equal(result.ok,false);assert.equal(result.output,"pi model attempted a tool while tools were disabled");
 await new Promise(resolve=>setTimeout(resolve,1_750));
 await assert.rejects(()=>access(marker),error=>(error as NodeJS.ErrnoException).code==="ENOENT");
});
test("direct Pi worker cannot obtain file tools without a live lifecycle grant",async()=>{
 const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"response",id:f.id,success:true,args:process.argv.slice(2)}));});');
 const candidate={id:"candidate",repository:d,revision:"revision",createdAt:"now"};
 const context=issueSkillContext("worker",d,candidate,{phase:"apply"});
 const paths=selectSkills(context).map(skill=>skill.path);
 const r=await runner(p).run({id:"worker",role:"worker",prompt:"implement",repository:d,candidate,writeSurfaces:["src"],skillContext:context,skillPaths:paths});
 assert.equal(r.ok,false);
 assert.match(r.output,/exact dispatcher receiver/);
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
test("direct Pi runner rejects a caller-supplied expectedPhase override for read roles",async()=>{
 const candidate={id:"candidate",repository:"missing-repo",revision:"revision",createdAt:"now"};
 const context=issueSkillContext("task:a",candidate.repository,candidate,{phase:"explore"});
 const skillPaths=selectSkills(context).map(item=>item.path);
 for(const role of ["reviewer","verifier"] as const){
  const result=await new PiProcessRunner({command:"does-not-exist"}).run({id:"task:a",role,expectedPhase:"explore",prompt:"inspect",repository:candidate.repository,candidate,skillContext:context,skillPaths});
  assert.equal(result.ok,false);assert.match(result.output,/agent role/);
 }
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

test("organic writer reaches Pi adapter through one exact Dispatcher receiver without SDD",async t=>{
 const {d,p}=await fixture('let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{const f=JSON.parse(x.trim());console.log(JSON.stringify({type:"response",id:f.id,success:true,args:process.argv.slice(2),authority:JSON.parse(process.env.ASEN_PI_AUTHORITY)}));});');
 t.after(()=>rm(d,{recursive:true,force:true}));
 const {issueOddDecision}=await import("./helpers/odd-routing.js"),{buildOrchestrationPlan}=await import("../src/orchestration/orchestrator.js"),{decideLifecycleApplicability}=await import("../src/lifecycle/applicability.js"),{issueOrganicWriterAdmission}=await import("../src/lifecycle/skill-lifecycle.js");
 const candidate={id:"organic",repository:d,revision:"revision",createdAt:"now"},decision=issueOddDecision({taskId:"organic",repository:d,paths:["src/a"],writes:[{path:"src/a",changeKind:"behavior"}]});
 buildOrchestrationPlan({taskId:"organic",repository:d,candidate,prompt:"write"},decision);
 const app=decideLifecycleApplicability(decision,{taskIdentity:"organic",repositoryIdentity:d,candidate:{id:candidate.id,repository:d,revision:candidate.revision},explicitMode:"unspecified",affectedSubsystems:["Pi"],expectedPaths:["src/a"],requiredArtifacts:[]});
 assert.equal(app.outcome,"organic");
 const skillContext=issueSkillContext("organic:worker",d,candidate,{phase:"apply",codeChange:true}),evidence=new EvidenceStore();
 for(const kind of ["work-unit","scope","rollback"] as const)evidence.add(candidate,{id:kind,kind,status:"pass",createdAt:"now",summary:"bounded"});
 const request={id:"organic:worker",role:"worker" as const,prompt:"write",repository:d,model:"local/test-model",thinking:"low" as const,candidate,skillContext,skillPaths:selectSkills(skillContext).map(s=>s.path),writeSurfaces:["src/a"],writerAdmission:issueOrganicWriterAdmission(app,["src/a"])};
 let captured:import("../src/agents/dispatcher.js").AgentRequest|undefined;
 const pi=runner(p),dispatcher=new Dispatcher({run:async call=>{captured=call;return pi.run(call);}},evidence);
 const result=await dispatcher.dispatch(request);assert.equal(result.ok,true,result.output);
 const observed=JSON.parse(result.output.trim().split(/\r?\n/).at(-1)!);
 assert.ok(observed.args.includes("read,edit,write"));assert.deepEqual(observed.authority.writeSurfaces,["src/a"]);
 assert.ok(observed.args.includes("--model"));assert.equal(observed.args[observed.args.indexOf("--model")+1],"local/test-model");
 assert.ok(observed.args.includes("--thinking"));assert.equal(observed.args[observed.args.indexOf("--thinking")+1],"low");
 assert.equal(captured?.phaseGrant,undefined);assert.ok(captured);
 const replay=await pi.run(captured);assert.equal(replay.ok,false);assert.match(replay.output,/exact dispatcher receiver/);
});
