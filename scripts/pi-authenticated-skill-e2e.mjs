import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {realpathSync} from "node:fs";
import {homedir} from "node:os";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
import {loadLifecycle} from "../src/lifecycle/skill-lifecycle.js";
import {recoveryKeyFromEnvironment} from "../src/session/recovery-key.js";

const repo=resolve(".");
const revision=execFileSync("git",["rev-parse","HEAD"],{cwd:repo,encoding:"utf8"}).trim();
if(process.env.ASEN_EXPECTED_SHA&&revision!==process.env.ASEN_EXPECTED_SHA)throw new Error("Authenticated Pi candidate does not match the PR HEAD");
if(!process.env.OPENROUTER_API_KEY)throw new Error("OPENROUTER_API_KEY repository secret is unavailable");
const candidate={id:"pr30-authenticated-pi",repository:repo,revision,createdAt:new Date().toISOString()};
const recovered=process.env.ASEN_RECOVERY_FILE?await loadLifecycle(process.env.ASEN_RECOVERY_FILE,"pr30-authenticated-pi",candidate,recoveryKeyFromEnvironment()):undefined;
if(recovered)assert.equal(recovered.state.nextPhase,"explore","Recovered lifecycle phase mismatch");
const recoveredContext=recovered?recovered.reissuePendingAuthority().context:undefined;
const probes=[
 {role:"explorer",context:recoveredContext??issueSkillContext("pr30-authenticated-pi:explorer",repo,candidate,{phase:"explore",risk:"low"}),expected:["skills/asen-phase-protocol/SKILL.md","skills/asen-explore/SKILL.md"]},
 {role:"reviewer",context:issueSkillContext("pr30-authenticated-pi:reviewer",repo,candidate,{phase:"adversarial-review",risk:"low"}),expected:["skills/asen-work-unit/SKILL.md","skills/asen-review/SKILL.md","skills/asen-adversarial-review/SKILL.md"]},
 {role:"verifier",context:issueSkillContext("pr30-authenticated-pi:verifier",repo,candidate,{phase:"verify",risk:"low"}),expected:["skills/asen-phase-protocol/SKILL.md","skills/asen-verify/SKILL.md"]},
 {role:"worker",context:issueSkillContext("pr30-authenticated-pi:worker",repo,candidate,{phase:"apply",risk:"low"}),expected:["skills/asen-phase-protocol/SKILL.md","skills/asen-work-unit/SKILL.md","skills/asen-safe-change/SKILL.md","skills/asen-apply/SKILL.md"]}
];
for(const probe of probes)assert.deepEqual(selectSkills(probe.context).map(skill=>skill.path),probe.expected);
const piMain=fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
const cli=join(dirname(piMain),"bundle","cli.js");
const results=[];
for(const probe of probes){
 const paths=probe.expected,expected=paths.map(path=>realpathSync(resolve(repo,path)));
 const args=[cli,"--mode","rpc","--no-session","--no-extensions","--no-skills","--no-tools","--provider","openrouter","--model","openrouter/auto",...paths.flatMap(path=>["--skill",path])];
 const child=spawn(process.execPath,args,{cwd:repo,env:process.env,stdio:["pipe","pipe","pipe"]});
 const command=value=>child.stdin.write(JSON.stringify(value)+"\n");
 const observed={loaded:false,finished:false,text:[],error:null};
 let buffer="",stderr="",bytes=0;
 const timeout=setTimeout(()=>child.kill(),180_000);
 command({id:"asen-load",type:"get_commands"});
 const handle=record=>{
  if(record.type==="response"&&record.id==="asen-load"){
   assert.equal(record.success,true,"Pi could not list loaded Skills");
   const actual=record.data.commands.filter(item=>item.source==="skill").map(item=>realpathSync(item.sourceInfo.path));
   assert.deepEqual(actual,expected,`Pi loaded an unexpected Skill set for ${probe.role}`);
   observed.loaded=true;
   command({id:"asen-turn",type:"prompt",message:`Complete this authenticated ${probe.role} audit turn without calling tools.`});
  }
  if(record.type==="tool_execution_start")throw new Error(`Authenticated ${probe.role} probe must not execute tools: ${record.toolName}`);
  if(record.type==="message_end"&&record.message?.role==="assistant"){
   if(record.message.stopReason==="error"){const detail=String(record.message.errorMessage??"No provider detail supplied").replaceAll(process.env.OPENROUTER_API_KEY,"[redacted]").slice(0,700);throw new Error(`Model turn reported an error for ${probe.role}: ${detail}`);}
   for(const item of record.message.content??[])if(item.type==="text")observed.text.push(item.text);
  }
  if(record.type==="agent_end"){observed.finished=true;child.stdin.end();}
  if(record.type==="response"&&record.id==="asen-turn"&&record.success===false)throw new Error(`Pi rejected the authenticated ${probe.role} prompt`);
 };
 child.stdout.on("data",chunk=>{try{bytes+=chunk.length;if(bytes>1_000_000)throw new Error("Pi output exceeded audit limit");buffer+=String(chunk);let e;while((e=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,e).trim();buffer=buffer.slice(e+1);if(line)handle(JSON.parse(line));}}catch(error){observed.error=error;child.kill();}});
 child.stderr.on("data",chunk=>{stderr=(stderr+String(chunk)).slice(-3000);});
 const exitCode=await new Promise((resolve,reject)=>{child.on("error",reject);child.on("close",resolve);});clearTimeout(timeout);
 if(observed.error)throw observed.error;if(exitCode!==0)throw new Error(`Pi exited with code ${exitCode}: ${stderr.replaceAll(process.env.OPENROUTER_API_KEY,"[redacted]")}`);
 assert.equal(observed.loaded,true,`Pi never confirmed native Skill loading for ${probe.role}`);assert.equal(observed.finished,true,`Authenticated ${probe.role} turn did not complete`);assert.ok(observed.text.join("\n").trim().length>0,`Authenticated ${probe.role} turn returned no assistant text`);
 results.push({role:probe.role,skills:paths,nativeSkillLoadCount:expected.length,toolCalls:0});
}
console.log(JSON.stringify({candidate:revision,provider:"openrouter",model:"openrouter/auto",probes:results,result:"PASS"}));
