import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {realpathSync} from "node:fs";
import {homedir} from "node:os";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
import {extractPiArtifact} from "../src/agents/pi-artifact-runner.js";

const repository=resolve(".");
const revision=execFileSync("git",["rev-parse","HEAD"],{cwd:repository,encoding:"utf8"}).trim();
assert.equal(revision,process.env.ASEN_EXPECTED_SHA,"Structured Pi candidate must be exact PR HEAD");
if(!process.env.OPENROUTER_API_KEY)throw new Error("OPENROUTER_API_KEY is unavailable");
const candidate={id:"pr30-structured-pi",repository,revision,createdAt:new Date().toISOString()};
const piMain=fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
const cli=join(dirname(piMain),"bundle","cli.js");
const roles=[["worker","apply"],["reviewer","adversarial-review"],["verifier","verify"]];
const results=[];
for(const [role,phase] of roles){
 const taskId=`${candidate.id}:${role}`;
 const context=issueSkillContext(taskId,repository,candidate,{phase,risk:"low"});
 const selected=selectSkills(context).map(skill=>skill.path);
 const expected=selected.map(path=>realpathSync(resolve(repository,path)));
 const id=`artifact-${role}`;
 const child=spawn(process.execPath,[cli,"--mode","rpc","--no-session","--no-extensions","--no-skills","--no-tools","--provider","openrouter","--model","openrouter/auto",...selected.flatMap(path=>["--skill",path])],{cwd:repository,env:process.env,stdio:["pipe","pipe","pipe"]});
 const command=value=>child.stdin.write(JSON.stringify(value)+"\n");
 const metadata={taskId,role,phase,repository,candidateId:candidate.id,revision,kind:"audit-observation",content:"Brief observation"};
 const message=[
 "This is a machine-readable ASEN audit step, not a conversational request.",
 "Your entire assistant response MUST be exactly the JSON object on the next line.",
 "Do not use Markdown fences. Do not add prose. Do not rename, omit, or add fields. Do not call tools.",
 JSON.stringify(metadata)
].join("\n");
 assert.ok(message.includes("\n"),"Structured Pi prompt must contain real line breaks");
 assert.ok(!message.includes("\\\\n"),"Structured Pi prompt must not contain escaped line-break text");
 let buffer="",output="",stderr="",failure=null,loaded=false,finished=false;
 const timeout=setTimeout(()=>child.kill(),180000);
 command({id:`load-${role}`,type:"get_commands"});
 child.stdout.on("data",chunk=>{
  try{
   output+=String(chunk);buffer+=String(chunk);
   if(Buffer.byteLength(output)>1000000)throw new Error("Pi artifact output exceeded limit");
   let end;while((end=buffer.indexOf("\n"))>=0){
    const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
    if(!line)continue;
    const record=JSON.parse(line);
    if(record.type==="response"&&record.id===`load-${role}`){
     assert.equal(record.success,true,"Pi failed native Skill load check");
     const actual=record.data.commands.filter(item=>item.source==="skill").map(item=>realpathSync(item.sourceInfo.path));
     assert.deepEqual(actual,expected,"Pi artifact probe loaded wrong Skills");
     loaded=true;command({id,type:"prompt",message});
    }
    if(record.type==="tool_execution_start")throw new Error("Pi artifact probe attempted a tool");
    if(record.type==="message_end"&&record.message?.role==="assistant"&&record.message.stopReason==="error"){
     const detail=String(record.message.errorMessage??"No provider detail").replaceAll(process.env.OPENROUTER_API_KEY,"[redacted]").slice(0,700);
     throw new Error(`Model turn reported an error for ${role}: ${detail}`);
    }
    if(record.type==="agent_end"){finished=true;child.stdin.end();}
   }
  }catch(error){failure=error;child.kill();}
 });
 child.stderr.on("data",chunk=>{stderr=(stderr+String(chunk)).slice(-3000);});
 const exit=await new Promise((ok,fail)=>{child.on("error",fail);child.on("close",ok);});
 clearTimeout(timeout);
 if(failure)throw failure;
 if(exit!==0)throw new Error(`Pi artifact process failed for ${role}: ${stderr.replaceAll(process.env.OPENROUTER_API_KEY,"[redacted]")}`);
 assert.ok(loaded&&finished,"Pi artifact probe did not finish");
 const records=output.trim().split(/\r?\n/).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
 const final=records.filter(record=>record.type==="message_end"&&record.message?.role==="assistant").at(-1);
 const assistantText=final?.message?.content?.filter(item=>item.type==="text").map(item=>item.text).join("")??"";
 let raw;
 try{raw=JSON.parse(assistantText);}
 catch(error){
  console.error(JSON.stringify({role,assistantLength:assistantText.length,assistantPrefix:assistantText.replaceAll(process.env.OPENROUTER_API_KEY,"[redacted]").slice(0,280)}));
  throw new Error(`Model artifact ${role} is not strict JSON`,{cause:error});
 }
 assert.deepEqual(Object.keys(raw).sort(),Object.keys(metadata).sort(),`Model artifact ${role} has wrong fields`);
 for(const key of ["taskId","role","phase","repository","candidateId","revision","kind"])assert.equal(raw[key],metadata[key],`Model artifact ${role} has wrong ${key}`);
 assert.equal(typeof raw.content,"string");assert.ok(raw.content.trim(),"Model artifact is empty");
 const artifact=JSON.parse(extractPiArtifact(output,id));
 for(const key of ["repository","candidateId","revision","kind"])assert.equal(artifact[key],metadata[key],`ASEN artifact ${role} lost ${key}`);
 assert.equal(artifact.content,raw.content,`ASEN artifact ${role} changed model content`);
 results.push({role,phase,skills:selected,kind:artifact.kind});
}
console.log(JSON.stringify({candidate:revision,model:"openrouter/openrouter/auto",artifacts:results,result:"PASS"}));
