import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,rm,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawn} from "node:child_process";
import {prepare,grade} from "./t12-real-agent-fixture.mjs";

const selectedPath=process.env.RUNNER_TEMP && join(process.env.RUNNER_TEMP,"asen-selected-model");
assert.ok(selectedPath,"RUNNER_TEMP required");
assert.ok(process.env.OLLAMA_API_KEY,"OLLAMA_API_KEY required");
const model=(await readFile(selectedPath,"utf8")).trim();
assert.ok(model && !/[\r\n]/.test(model),"Invalid selected model");
const directory=await mkdtemp(join(tmpdir(),"asen-t12-real-model-"));
const evidence=resolve("asen-acceptance-evidence");
await mkdir(evidence,{recursive:true});
try{
 const fixture=join(directory,"fixture");
 const manifest=await prepare(fixture);
 await writeFile(join(evidence,"fixture-manifest.json"),JSON.stringify(manifest,null,2));
 const chunks=[await readFile(join(fixture,"README.md"),"utf8")];
 for(const name of ["src/pricing.js","src/access.js","src/parse.js"]){
  chunks.push("FILE: "+name+"\n"+await readFile(join(fixture,name),"utf8"));
 }
 const answer=await new Promise((resolveAnswer,reject)=>{
  const child=spawn(join(process.cwd(),"node_modules",".bin","pi"),["--provider","ollama-cloud","--model",model,"--no-session","--print",chunks.join("\n")],{env:process.env,stdio:["ignore","pipe","pipe"]});
  let stdout="",stderr="";
  const stop=setTimeout(()=>child.kill("SIGKILL"),90_000);
  child.stdout.on("data",data=>{stdout+=data;if(stdout.length>16384)child.kill("SIGKILL");});
  child.stderr.on("data",data=>{stderr=(stderr+String(data)).slice(-1500);});
  child.on("error",error=>{clearTimeout(stop);reject(error);});
  child.on("close",code=>{clearTimeout(stop);if(code!==0)reject(new Error("Pi fixture run failed with exit "+code+"; stderr available in runner logs"));else resolveAnswer(stdout);});
 });
 const responseFile=join(evidence,"fixture-response.json");
 await writeFile(responseFile,answer,{mode:0o600});
 const result=await grade(fixture,responseFile);
 await writeFile(join(evidence,"fixture-grade.json"),JSON.stringify({...result,provider:"ollama-cloud",model},null,2));
 assert.equal(result.passed,true,"Real provider did not identify all known defects");
 console.log("T12 real-model read-only fixture grade PASS");
}finally{
 await rm(directory,{recursive:true,force:true});
}
