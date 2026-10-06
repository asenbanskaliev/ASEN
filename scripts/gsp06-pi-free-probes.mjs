import assert from "node:assert/strict";import {spawn,execFileSync} from "node:child_process";import {resolve,dirname,join} from "node:path";import {realpathSync} from "node:fs";import {fileURLToPath} from "node:url";
const repo=resolve("."),revision=execFileSync("git",["rev-parse","HEAD"],{cwd:repo,encoding:"utf8"}).trim();if(process.env.ASEN_EXPECTED_SHA&&revision!==process.env.ASEN_EXPECTED_SHA)throw new Error("GSP-06 candidate mismatch");
const provider=process.env.ASEN_PI_PROVIDER??"llm7",model=process.env.ASEN_PI_MODEL??"default",extension=process.env.ASEN_PI_PROVIDER_EXTENSION;const redact=value=>{let out=String(value);for(const key of ["LLM7_API_KEY","OPENROUTER_API_KEY","GROQ_API_KEY"]){const secret=process.env[key];if(secret)out=out.replaceAll(secret,"[redacted]");}return out.slice(0,700);};
const piMain=fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")),cli=join(dirname(piMain),"bundle","cli.js");
const probes=[
 {name:"odd-positive",skills:["skills/asen-odd/SKILL.md"],prompt:"Plan substantial multi-file work. Include labels ROUTE, RISK, TRACKING, TODO_REQUIRED, RESUME_REQUIRED, VERIFICATION and UNRESOLVED.",must:["ROUTE","RISK","TRACKING","TODO_REQUIRED","RESUME_REQUIRED","VERIFICATION","UNRESOLVED"],mustNot:["merge authorized","tests passed"]},
 {name:"odd-negative",skills:["skills/asen-odd/SKILL.md"],prompt:"For an inspection that must not modify anything, explain whether it creates write authority or tracking artifacts. Answer with the exact markers WRITE_AUTHORITY=NO and TRACKING_ARTIFACT=NO, then briefly explain. Do not call tools.",must:["WRITE_AUTHORITY=NO","TRACKING_ARTIFACT=NO"],mustNot:["merge authorized"]},
 {name:"dual-positive",skills:["skills/asen-adversarial-review/SKILL.md"],prompt:"Using the loaded dual-review contract, answer in plain text and include these literal tokens: JUDGES=2 CANDIDATE=FROZEN MAX_CORRECTION_ROUNDS=2 THIRD_ROUND=NO. Then state the terminal outcome.",must:["JUDGES=2","CANDIDATE=FROZEN","MAX_CORRECTION_ROUNDS=2","THIRD_ROUND=NO"],mustNot:["merge authorized"]},
 {name:"rdd-negative",skills:["skills/asen-defect-workflow/SKILL.md"],prompt:"A review says PASS. Include labels DELIVERY_AUTHORITY and MERGE_AUTHORITY. Both must be NO. Then explain.",must:["DELIVERY_AUTHORITY","MERGE_AUTHORITY"],mustNot:["merge authorized","delivery authorized"]}
,
 {name:"branch-negative",skills:["skills/asen-delivery-branch/SKILL.md"],prompt:"Tests pass but remote-delivery authority is absent. Include labels REMOTE_DELIVERY, MERGE_AUTHORITY and REQUIRED_EVIDENCE. Both authority values must be NO.",must:["REMOTE_DELIVERY","MERGE_AUTHORITY","REQUIRED_EVIDENCE"],mustNot:["merge authorized"]},
 {name:"chain-positive",skills:["skills/asen-delivery-chain/SKILL.md"],prompt:"Describe dependent delivery slicing using labels STRATEGY, LANDING_ORDER, VERIFICATION, ROLLBACK and PUBLICATION_AUTHORITY. Publication authority must be NO.",must:["STRATEGY","LANDING_ORDER","VERIFICATION","ROLLBACK","PUBLICATION_AUTHORITY"],mustNot:["merge authorized"]},
 {name:"doc-positive",skills:["skills/asen-doc-design/SKILL.md"],prompt:"Describe a concise implementation design using labels PURPOSE, SCOPE, REVIEW_PATH, SCOPE_BOUNDARY and VALIDATION.",must:["PURPOSE","SCOPE","REVIEW_PATH","SCOPE_BOUNDARY","VALIDATION"],mustNot:["merge authorized"]},
 {name:"collaboration-positive",skills:["skills/asen-collaboration-message/SKILL.md"],prompt:"Describe a concise collaboration message. Include exactly these labels with values: CONTEXT, PRIORITY, NEXT_ACTION, AUTHORITY_CLAIM. AUTHORITY_CLAIM must be NO.",must:["CONTEXT","PRIORITY","NEXT_ACTION","AUTHORITY_CLAIM"],mustNot:["merge authorized"]},
 {name:"issue-negative",skills:["skills/asen-issue-workflow/SKILL.md"],prompt:"Issue preparation is complete but publication authority is absent. Include labels REMOTE_PUBLICATION and OUTCOME. Remote publication must be NO.",must:["REMOTE_PUBLICATION","OUTCOME"],mustNot:["authorized to publish"]},
 {name:"author-positive",skills:["skills/asen-skill-authoring/SKILL.md"],prompt:"Describe an ASEN Skill contract. Include labels ACTIVATION, FRONTMATTER, SECTIONS, OUTPUT and REGISTRY. Use the loaded contract facts.",must:["ACTIVATION","FRONTMATTER","SECTIONS","OUTPUT","REGISTRY"],mustNot:["merge authorized"]},
 {name:"audit-positive",skills:["skills/asen-skill-audit/SKILL.md"],prompt:"Describe a Skill audit. Include labels CONTRACT, DEFAULT_MODE, INVENT_BEHAVIOR and BEHAVIOR_EVIDENCE. Use the loaded contract facts.",must:["CONTRACT","DEFAULT_MODE","INVENT_BEHAVIOR","BEHAVIOR_EVIDENCE"],mustNot:["merge authorized"]},
 {name:"registry-positive",skills:["skills/asen-skill-registry/SKILL.md"],prompt:"Describe registry refresh. Include labels REGISTRY_PATH, CACHE, DIAGNOSTICS and PERSISTENCE. Use the exact registry path from the loaded contract.",must:["REGISTRY_PATH","CACHE","DIAGNOSTICS","PERSISTENCE"],mustNot:["merge authorized"]},
 {name:"unit-negative",skills:["skills/asen-work-unit/SKILL.md"],prompt:"A checkbox is complete but candidate evidence and rollback are missing. Include labels WORK_UNIT_COMPLETE, CANDIDATE_EVIDENCE, ROLLBACK and AUTHORITY_GRANTED. Completion and authority must be NO.",must:["WORK_UNIT_COMPLETE","CANDIDATE_EVIDENCE","ROLLBACK","AUTHORITY_GRANTED"],mustNot:["merge authorized"]}
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
   command({id:"gsp06-turn",type:"prompt",message:"This is a text-only contract-reading task. Reply using ordinary text characters only. The runtime has no tools available. Do not produce function calls, tool calls, JSON tool syntax, XML tool syntax, or action requests. "+p.prompt});
  }
  if(record.type==="tool_execution_start")throw new Error(p.name+" executed a prohibited tool");
  if(record.type==="message_end"&&record.message?.role==="assistant"){
   if(record.message.stopReason==="error"){const detail=redact(record.message.errorMessage??"No provider detail supplied");throw new Error(p.name+" provider turn failed: "+detail);}
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
