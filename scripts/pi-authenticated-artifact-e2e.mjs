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
if(!process.env.LLM7_API_KEY)throw new Error("LLM7_API_KEY is unavailable");
const candidate={id:"pr30-structured-pi",repository,revision,createdAt:new Date().toISOString()};
const piMain=fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
const cli=join(dirname(piMain),"bundle","cli.js");
const provider=realpathSync(join(process.env.PI_CODING_AGENT_DIR??join(homedir(),".pi","agent"),"npm","node_modules","pi-free","dist","index.js"));
const roles=[["worker","apply"],["reviewer","adversarial-review"],["verifier","verify"]];
const results=[];
for(const [role,phase] of roles){
 const taskId=`${candidate.id}:${role}`;
 const context=issueSkillContext(taskId,repository,candidate,{phase,risk:"low"});
 const selected=selectSkills(context).map(skill=>skill.path);
 const expected=selected.map(path=>realpathSync(resolve(repository,path)));
 const id=`artifact-${role}`;
 const child=spawn(process.execPath,[cli,"--mode","rpc","--no-session","--no-extensions","--extension",provider,"--no-skills","--no-tools","--provider","llm7","--model","default",...selected.flatMap(path=>["--skill",path])],{cwd:repository,env:process.env,stdio:["pipe","pipe","pipe"]});
 const command=value=>child.stdin.write(JSON.stringify(value)+"\n");
 const metadata={taskId,role,phase,repository,candidateId:candidate.id,revision,kind:"audit-observation",content:"Brief observation"};
 const message=`Return only one JSON object with these exact fields and values: ${JSON.stringify(metadata)}. Do not call tools.`;
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
     const detail=String(record.message.errorMessage??"No provider detail").replaceAll(process.env.LLM7_API_KEY,"[redacted]").slice(0,700);
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
 if(exit!==0)throw new Error(`Pi artifact process failed for ${role}: ${stderr.replaceAll(process.env.LLM7_API_KEY,"[redacted]")}`);
 assert.ok(loaded&&finished,"Pi artifact probe did not finish");
 let artifact;
 try{artifact=JSON.parse(extractPiArtifact(output,id));}
 catch(error){
  const records=output.trim().split(/\r?\n/).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
  const final=records.filter(record=>record.type==="message_end"&&record.message?.role==="assistant").at(-1);
  const text=final?.message?.content?.filter(item=>item.type==="text").map(item=>item.text).join("")??"";
  console.error(JSON.stringify({role,assistantLength:text.length,assistantPrefix:text.replaceAll(process.env.LLM7_API_KEY,"[redacted]").slice(0,280)}));
  throw error;
 }
 for(const key of ["taskId","role","phase","repository","candidateId","revision","kind"])assert.equal(artifact[key],metadata[key],`Model artifact ${role} has wrong ${key}`);
 assert.equal(typeof artifact.content,"string");assert.ok(artifact.content.trim(),"Model artifact is empty");
 results.push({role,phase,skills:selected,kind:artifact.kind});
}
console.log(JSON.stringify({candidate:revision,model:"llm7/default",artifacts:results,result:"PASS"}));
