import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {realpathSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";

const repo=resolve(".");
const revision=execFileSync("git",["rev-parse","HEAD"],{cwd:repo,encoding:"utf8"}).trim();
if(process.env.ASEN_EXPECTED_SHA&&revision!==process.env.ASEN_EXPECTED_SHA)throw new Error("Authenticated Pi candidate does not match the PR HEAD");
if(!process.env.LLM7_API_KEY)throw new Error("LLM7_API_KEY repository secret is unavailable");
const candidate={id:"pr30-authenticated-pi",repository:repo,revision,createdAt:new Date().toISOString()};
const context=issueSkillContext("pr30-authenticated-pi:explorer",repo,candidate,{phase:"explore",risk:"low"});
const selected=selectSkills(context);
const paths=selected.map(skill=>skill.path);
assert.deepEqual(paths,["skills/asen-phase-protocol/SKILL.md","skills/asen-explore/SKILL.md"]);
const piMain=fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
const cli=join(dirname(piMain),"bundle","cli.js");
const args=[cli,"--mode","rpc","--no-session","--no-skills","--no-tools","--provider","llm7","--model","default",...paths.flatMap(path=>["--skill",path])];
const child=spawn(process.execPath,args,{cwd:repo,env:process.env,stdio:["pipe","pipe","pipe"]});
const command=value=>child.stdin.write(JSON.stringify(value)+"\n");
const observed={loaded:false,finished:false,read:[],text:[],error:null};
let buffer="",stderr="",bytes=0;
const expected=paths.map(path=>realpathSync(resolve(repo,path)));
const exactPaths=expected.join(" and ");
const timeout=setTimeout(()=>child.kill(),180_000);
command({id:"asen-load",type:"get_commands"});
const handle=record=>{
 if(record.type==="response"&&record.id==="asen-load"){
  assert.equal(record.success,true,"Pi could not list loaded Skills");
  const actual=record.data.commands.filter(item=>item.source==="skill").map(item=>realpathSync(item.sourceInfo.path));
  assert.deepEqual(actual,expected,"Pi loaded an unexpected Skill set");
  observed.loaded=true;
  command({id:"asen-turn",type:"prompt",message:"Complete this authenticated read-only audit turn without calling tools."});
 }
 if(record.type==="tool_execution_start")throw new Error(`Authenticated Pi probe must not execute tools: ${record.toolName}`);
 if(record.type==="message_end"&&record.message?.role==="assistant"){
  if(record.message.stopReason==="error"){
   const detail=String(record.message.errorMessage??"No provider detail supplied").replaceAll(process.env.LLM7_API_KEY,"[redacted]").slice(0,700);
   throw new Error(`Model turn reported an error: ${detail}`);
  }
  for(const item of record.message.content??[])if(item.type==="text")observed.text.push(item.text);
 }
 if(record.type==="agent_end"){
  observed.finished=true;
  child.stdin.end();
 }
 if(record.type==="response"&&record.id==="asen-turn"&&record.success===false)throw new Error("Pi rejected the authenticated prompt");
};
child.stdout.on("data",chunk=>{
 try{
  bytes+=chunk.length;if(bytes>1_000_000)throw new Error("Pi output exceeded audit limit");
  buffer+=String(chunk);
  let end;while((end=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(line)handle(JSON.parse(line));}
 }catch(error){observed.error=error;child.kill();}
});
child.stderr.on("data",chunk=>{stderr=(stderr+String(chunk)).slice(-3000);});
const exitCode=await new Promise((resolve,reject)=>{child.on("error",reject);child.on("close",resolve);});
clearTimeout(timeout);
if(observed.error)throw observed.error;
if(exitCode!==0)throw new Error(`Pi exited with code ${exitCode}: ${stderr.replaceAll(process.env.LLM7_API_KEY,"[redacted]")}`);
assert.equal(observed.loaded,true,"Pi never confirmed native Skill loading");
assert.equal(observed.finished,true,"Authenticated model turn did not complete");
assert.deepEqual(observed.read,[],"Authenticated model turn unexpectedly executed a read");
assert.ok(observed.text.join("\n").trim().length>0,"Authenticated model turn returned no assistant text");
console.log(JSON.stringify({candidate:revision,provider:"llm7",model:"default",skills:paths,nativeSkillLoadCount:expected.length,toolCalls:observed.read.length,result:"PASS"}));
