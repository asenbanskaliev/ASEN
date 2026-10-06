import assert from "node:assert/strict";import {spawn,execFileSync} from "node:child_process";import {resolve,dirname,join} from "node:path";import {realpathSync} from "node:fs";import {fileURLToPath} from "node:url";
const repo=resolve("."),revision=execFileSync("git",["rev-parse","HEAD"],{cwd:repo,encoding:"utf8"}).trim();if(process.env.ASEN_EXPECTED_SHA&&revision!==process.env.ASEN_EXPECTED_SHA)throw new Error("GSP-06 candidate mismatch");
const provider=process.env.ASEN_PI_PROVIDER??"llm7",model=process.env.ASEN_PI_MODEL??"default",extension=process.env.ASEN_PI_PROVIDER_EXTENSION;
const piMain=fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")),cli=join(dirname(piMain),"bundle","cli.js");
const probes=[
 {name:"odd-positive",skills:["skills/asen-odd/SKILL.md"],prompt:"Plan a substantial multi-file implementation. State route, risk, tracking state, TODO/resume need, verification and unresolved decisions. Do not call tools.",must:["route","risk","TODO"],mustNot:["merge authorized","tests passed"]},
 {name:"odd-negative",skills:["skills/asen-odd/SKILL.md"],prompt:"For an inspection that must not modify anything, explain whether it creates write authority or tracking artifacts. Answer with the exact markers WRITE_AUTHORITY=NO and TRACKING_ARTIFACT=NO, then briefly explain. Do not call tools.",must:["WRITE_AUTHORITY=NO","TRACKING_ARTIFACT=NO"],mustNot:["merge authorized"]},
 {name:"dual-positive",skills:["skills/asen-adversarial-review/SKILL.md"],prompt:"Describe the required dual review for one frozen candidate, including judge count, correction-round limit and terminal outcomes. Do not call tools.",must:["two","frozen"],mustNot:["merge authorized"]},
 {name:"rdd-negative",skills:["skills/asen-defect-workflow/SKILL.md"],prompt:"A review says PASS. Explain whether that alone authorizes delivery or merge. Do not call tools.",must:["not"],mustNot:["merge authorized","delivery authorized"]}
,
 {name:"branch-negative",skills:["skills/asen-delivery-branch/SKILL.md"],prompt:"Explain whether passing tests alone permit remote delivery, and name the remaining evidence.",must:["not"],mustNot:["merge authorized"]},
 {name:"chain-positive",skills:["skills/asen-delivery-chain/SKILL.md"],prompt:"Describe dependent delivery slicing, landing order, verification and rollback.",must:["depend"],mustNot:["merge authorized"]},
 {name:"doc-positive",skills:["skills/asen-doc-design/SKILL.md"],prompt:"Describe a concise implementation design with purpose, scope and review.",must:["purpose","scope"],mustNot:["merge authorized"]},
 {name:"collaboration-positive",skills:["skills/asen-collaboration-message/SKILL.md"],prompt:"Describe a concise collaboration message with context and one clear priority.",must:["context"],mustNot:["merge authorized"]},
 {name:"issue-negative",skills:["skills/asen-issue-workflow/SKILL.md"],prompt:"Explain whether issue preparation alone permits remote publication.",must:["not"],mustNot:["authorized to publish"]},
 {name:"author-positive",skills:["skills/asen-skill-authoring/SKILL.md"],prompt:"Describe the required shape, activation and output rules of an ASEN Skill contract.",must:["activation","output"],mustNot:["merge authorized"]},
 {name:"audit-positive",skills:["skills/asen-skill-audit/SKILL.md"],prompt:"Describe auditing an ASEN Skill against its exact local contract without guessing behavior.",must:["contract"],mustNot:["merge authorized"]},
 {name:"registry-positive",skills:["skills/asen-skill-registry/SKILL.md"],prompt:"Describe a registry refresh result with exact path, cache state, duplicates, skips and persistence.",must:[".asen/skill-registry.md","cache"],mustNot:["merge authorized"]},
 {name:"unit-negative",skills:["skills/asen-work-unit/SKILL.md"],prompt:"A task checkbox is complete but candidate evidence and rollback are missing. Explain whether the work unit is complete.",must:["not"],mustNot:["merge authorized"]}
];
async function run(p){
 const expected=p.skills.map(x=>realpathSync(resolve(repo,x)));
 const args=[cli,"--mode","rpc","--no-session","--no-extensions",...(extension?["--extension",extension]:[]),"--no-skills","--no-tools","--provider",provider,"--model",model,...p.skills.flatMap(x=>["--skill",x])];
 const child=spawn(process.execPath,args,{cwd:repo,env:process.env,stdio:["pipe","pipe","pipe"]});
 const command=value=>child.stdin.write(JSON.stringify(value)+"\n");
 const observed={loaded:false,finished:false,text:[],error:null};
 let buffer="",stderr="",bytes=0;
 const timeout=setTimeout(()=>child.kill(),180000);
 command({id:"gsp06-load",type:"get_commands"});
 const handle=record=>{
  if(record.type==="response"&&record.id==="gsp06-load"){
   assert.equal(record.success,true,p.name+" could not list loaded Skills");
   const actual=record.data.commands.filter(x=>x.source==="skill").map(x=>realpathSync(x.sourceInfo.path));
   assert.deepEqual(actual,expected,p.name+" loaded unexpected Skills");
   observed.loaded=true;
   command({id:"gsp06-turn",type:"prompt",message:"Respond with plain text only. Do not call, request, simulate, or suggest any tool. Do not emit tool-call syntax. "+p.prompt});
  }
  if(record.type==="tool_execution_start")throw new Error(p.name+" executed a prohibited tool");
  if(record.type==="message_end"&&record.message?.role==="assistant"){
   if(record.message.stopReason==="error"){const detail=String(record.message.errorMessage??"No provider detail supplied").replaceAll(process.env.LLM7_API_KEY??"","[redacted]").slice(0,700);throw new Error(p.name+" provider turn failed: "+detail);}
   for(const x of record.message.content??[])if(x.type==="text")observed.text.push(x.text);
  }
  if(record.type==="agent_end"){observed.finished=true;child.stdin.end();}
  if(record.type==="response"&&record.id==="gsp06-turn"&&record.success===false)throw new Error(p.name+" prompt was rejected");
 };
 child.stdout.on("data",chunk=>{try{bytes+=chunk.length;if(bytes>1000000)throw new Error(p.name+" output exceeded limit");buffer+=String(chunk);let e;while((e=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,e).trim();buffer=buffer.slice(e+1);if(line)handle(JSON.parse(line));}}catch(error){observed.error=error;child.kill();}});
 child.stderr.on("data",chunk=>{stderr=(stderr+String(chunk)).slice(-2000);});
 const code=await new Promise((ok,no)=>{child.on("error",no);child.on("close",ok)});clearTimeout(timeout);
 if(observed.error)throw observed.error;
 assert.equal(code,0,p.name+" Pi exit failed: "+stderr);
 assert.equal(observed.loaded,true,p.name+" never confirmed native Skill loading");
 assert.equal(observed.finished,true,p.name+" did not finish");
 const text=observed.text.join("\n").trim();assert.ok(text.length>0,p.name+" returned no assistant text");
 const lower=text.toLowerCase();for(const x of p.must)assert.ok(lower.includes(x.toLowerCase()),p.name+" missing "+x);for(const x of p.mustNot)assert.ok(!lower.includes(x.toLowerCase()),p.name+" prohibited "+x);
 return {name:p.name,bytes:text.length,nativeSkillLoadCount:expected.length,toolCalls:0};
}
const results=[];for(const p of probes)results.push(await run(p));console.log(JSON.stringify({candidate:revision,provider,model,result:"PASS",probes:results}));
