import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
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
const marker=randomUUID();
const args=[cli,"--mode","rpc","--no-session","--no-skills","--tools","read","--provider","llm7","--model","default",...paths.flatMap(path=>["--skill",path])];
const child=spawn(process.execPath,args,{cwd:repo,env:process.env,stdio:["pipe","pipe","pipe"]});
const command=value=>child.stdin.write(JSON.stringify(value)+"\n");
const observed={loaded:false,finished:false,read:[],text:[],error:null};
let buffer="",stderr="",bytes=0;
const expected=paths.map(path=>realpathSync(resolve(repo,path)));
const timeout=setTimeout(()=>child.kill(),180_000);
command({id:"asen-load",type:"get_commands"});
const handle=record=>{
 if(record.type==="response"&&record.id==="asen-load"){
  assert.equal(record.success,true,"Pi could not list loaded Skills");
  const actual=record.data.commands.filter(item=>item.source==="skill").map(item=>realpathSync(item.sourceInfo.path));
  assert.deepEqual(actual,expected,"Pi loaded an unexpected Skill set");
  observed.loaded=true;
  command({id:"asen-turn",type:"prompt",message:`ASEN read-only audit. Candidate ${candidate.id} revision ${revision}. Use the read tool to read only these two exact repository-relative file paths, one at a time: ${paths.join(" and ")}. The candidate id and revision are metadata, never file paths. Do not read any other path. Do not call any other tool, modify files, or delegate. Then reply with the exact marker ASEN_AUTH_PROBE:${marker}:READ_ONLY and one short sentence explaining why the phase protocol forbids redelegation. If a file cannot be read, explain the blocker without the marker.`});
 }
 if(record.type==="tool_execution_start"){
  if(record.toolName!=="read")throw new Error(`Disallowed Pi tool: ${record.toolName}`);
  const path=record.args?.path??record.args?.file_path;
  if(typeof path!=="string")throw new Error("Read tool did not identify its path");
  const requested=resolve(repo,path);\n  const allowed=expected.includes(requested);\n  if(!allowed)throw new Error(`Disallowed Pi read path: ${path}`);\n  observed.read.push(realpathSync(requested));
 }
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
assert.deepEqual(observed.read,expected,"Model did not read the exact selected Skills");
assert.ok(observed.text.join("\n").includes(`ASEN_AUTH_PROBE:${marker}:READ_ONLY`),"Model did not return the audited marker");
console.log(JSON.stringify({candidate:revision,provider:"llm7",model:"default",skills:paths,readCount:observed.read.length,result:"PASS"}));
