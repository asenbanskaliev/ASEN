import assert from "node:assert/strict";
import {mkdtemp,mkdir,readFile,realpath,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {spawnContained} from "../src/evidence/spawn-contained.js";
import {SKILL_REGISTRY_RELATIVE_PATH} from "../src/skills/generated-registry.js";

const PROCESS_TIMEOUT_MS=30_000,MAX_OUTPUT_BYTES=8_192;
const fixture=fileURLToPath(new URL("./fixtures/skill-registry-restart-process.ts",import.meta.url));
const document=(description:string)=>`---\nname: recreated\ndescription: "${description}"\n---\nBody\n`;
type Observation={phase:"A"|"B"|"C";cache:"hit"|"regenerated";hasExpected:boolean;hasExcluded:boolean;sha256:string;shutdown:true;watcherClosed:true};

function containedEnvironment():NodeJS.ProcessEnv{
 const env:NodeJS.ProcessEnv={PI_TELEMETRY:"0"};
 for(const name of ["PATH","Path","PATHEXT","SystemRoot","WINDIR","TEMP","TMP","TMPDIR"]){
  const value=process.env[name];if(value!==undefined)env[name]=value;
 }
 return env;
}
function isObservation(value:unknown):value is Observation{
 if(typeof value!=="object"||value===null||Array.isArray(value))return false;
 const item=value as Record<string,unknown>;
 return Object.keys(item).sort().join(",")==="cache,hasExcluded,hasExpected,phase,sha256,shutdown,watcherClosed"&&
  (item.phase==="A"||item.phase==="B"||item.phase==="C")&&(item.cache==="hit"||item.cache==="regenerated")&&
  typeof item.hasExpected==="boolean"&&typeof item.hasExcluded==="boolean"&&
  typeof item.sha256==="string"&&/^[a-f0-9]{64}$/.test(item.sha256)&&item.shutdown===true&&item.watcherClosed===true;
}
async function runProcess(phase:Observation["phase"],project:string,home:string,packageRoot:string,expected:string,excluded:string):Promise<Observation>{
 const child=spawnContained(process.execPath,["--import","tsx",fixture,phase,project,home,packageRoot,expected,excluded],{
  cwd:fileURLToPath(new URL("..",import.meta.url)),env:containedEnvironment(),stdio:["ignore","pipe","pipe"],
 });
 let stdout=Buffer.alloc(0),stderrBytes=0,overflow=false,timedOut=false;
 child.stdout?.on("data",(chunk:Buffer)=>{stdout=Buffer.concat([stdout,chunk]);if(stdout.length>MAX_OUTPUT_BYTES){overflow=true;child.kill();}});
 child.stderr?.on("data",(chunk:Buffer)=>{stderrBytes+=chunk.length;if(stderrBytes>MAX_OUTPUT_BYTES){overflow=true;child.kill();}});
 const exitCode=await new Promise<number|null>((resolve,reject)=>{
  const timer=setTimeout(()=>{timedOut=true;child.kill();},PROCESS_TIMEOUT_MS);
  child.once("error",error=>{clearTimeout(timer);reject(error);});
  child.once("close",code=>{clearTimeout(timer);resolve(code);});
 });
 if(timedOut)throw new Error("restart subprocess timed out");
 if(overflow)throw new Error("restart subprocess output exceeded its bound");
 if(stderrBytes!==0)throw new Error("restart subprocess emitted stderr");
 if(exitCode!==0)throw new Error("restart subprocess failed");
 const lines=stdout.toString("utf8").split(/\r?\n/u).filter(Boolean);
 if(lines.length!==1)throw new Error("restart subprocess protocol was not one JSON record");
 let parsed:unknown;try{parsed=JSON.parse(lines[0]!);}catch{throw new Error("restart subprocess returned invalid JSON");}
 if(!isObservation(parsed)||parsed.phase!==phase)throw new Error("restart subprocess returned an invalid observation");
 return parsed;
}

await test("recreated skill source invalidates startup cache across independent local processes",{timeout:105_000},async t=>{
 const temporary=await mkdtemp(path.join(tmpdir(),"asen-registry-restart-")),root=await realpath(temporary);
 t.after(()=>rm(temporary,{recursive:true,force:true}));
 const project=path.join(root,"project"),home=path.join(root,"home"),packageRoot=path.join(root,"package"),skillDirectory=path.join(project,"skills","recreated"),skillFile=path.join(skillDirectory,"SKILL.md");
 await Promise.all([mkdir(skillDirectory,{recursive:true}),mkdir(home),mkdir(packageRoot)]);
 await writeFile(skillFile,document("First"));
 const first=await runProcess("A",project,home,packageRoot,"First","Second");
 assert.deepEqual({cache:first.cache,hasExpected:first.hasExpected,hasExcluded:first.hasExcluded,shutdown:first.shutdown,watcherClosed:first.watcherClosed},{cache:"regenerated",hasExpected:true,hasExcluded:false,shutdown:true,watcherClosed:true});
 await rm(skillDirectory,{recursive:true});
 await mkdir(skillDirectory,{recursive:true});
 await writeFile(skillFile,document("Second"));
 const second=await runProcess("B",project,home,packageRoot,"Second","First");
 assert.deepEqual({cache:second.cache,hasExpected:second.hasExpected,hasExcluded:second.hasExcluded,shutdown:second.shutdown,watcherClosed:second.watcherClosed},{cache:"regenerated",hasExpected:true,hasExcluded:false,shutdown:true,watcherClosed:true});
 const beforeThird=await readFile(path.join(project,SKILL_REGISTRY_RELATIVE_PATH));
 const third=await runProcess("C",project,home,packageRoot,"Second","First");
 const afterThird=await readFile(path.join(project,SKILL_REGISTRY_RELATIVE_PATH));
 assert.deepEqual({cache:third.cache,hasExpected:third.hasExpected,hasExcluded:third.hasExcluded,shutdown:third.shutdown,watcherClosed:third.watcherClosed},{cache:"hit",hasExpected:true,hasExcluded:false,shutdown:true,watcherClosed:true});
 assert.equal(third.sha256,second.sha256);
 assert.deepEqual(afterThird,beforeThird);
});
