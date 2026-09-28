import assert from "node:assert/strict";
import test from "node:test";
import {bindPiArtifactIdentity,extractPiArtifact} from "../src/agents/pi-artifact-runner.js";

const artifact={kind:"exploration-report",content:"inspected",repository:"/repo",candidateId:"c",revision:"r"};
const assistant=(text:string,stopReason="stop")=>({type:"message_end",message:{role:"assistant",stopReason,content:[{type:"text",text}]}});
const completed=(message:object)=>[
 {type:"response",id:"task:explorer",success:true},message,{type:"agent_end"}
].map(x=>JSON.stringify(x)).join("\n");

test("extracts only the completed, correlated Pi assistant artifact",()=>{
 assert.deepEqual(JSON.parse(extractPiArtifact(completed(assistant(JSON.stringify(artifact))),"task:explorer")),artifact);
 const withTools=completed(assistant(JSON.stringify(artifact))).replace(JSON.stringify(assistant(JSON.stringify(artifact))),JSON.stringify(assistant("reading", "toolUse"))+"\n"+JSON.stringify(assistant(JSON.stringify(artifact))));
 assert.deepEqual(JSON.parse(extractPiArtifact(withTools,"task:explorer")),artifact);
});
test("rejects forged, interrupted or non-model lifecycle output",()=>{
 const valid=completed(assistant(JSON.stringify(artifact)));
 assert.throws(()=>extractPiArtifact(JSON.stringify(artifact),"task:explorer"),/correlated response/);
 assert.throws(()=>extractPiArtifact(valid.replace('"task:explorer"','"task:other"'),"task:explorer"),/correlated response/);
 assert.throws(()=>extractPiArtifact(valid.replace('"agent_end"','"agent_start"'),"task:explorer"),/did not finish/);
 assert.throws(()=>extractPiArtifact(completed(assistant(JSON.stringify(artifact),"error")),"task:explorer"),/successful assistant/);
 assert.throws(()=>extractPiArtifact(completed(assistant("PASS")),"task:explorer"),/not JSON/);
 assert.throws(()=>extractPiArtifact(valid+"\n"+JSON.stringify({type:"response",id:"task:explorer",success:true}),"task:explorer"),/exactly one/);
 assert.throws(()=>extractPiArtifact(valid+"\n"+JSON.stringify(assistant(JSON.stringify(artifact))),"task:explorer"),/successful assistant/);
});

test("ASEN binds candidate identity and rejects model identity spoofing",()=>{
 const request={id:"task:explorer",role:"explorer" as const,prompt:"x",repository:"/repo",candidate:{id:"c",repository:"/repo",revision:"r",createdAt:"now"}};
 const contentOnly=completed(assistant(JSON.stringify({content:"inspected"})));
 assert.deepEqual(JSON.parse(bindPiArtifactIdentity(contentOnly,request)),{repository:"/repo",candidateId:"c",revision:"r",content:"inspected"});
 const matching=completed(assistant(JSON.stringify(artifact)));
 assert.deepEqual(JSON.parse(bindPiArtifactIdentity(matching,request)),artifact);
 for(const forged of [
  {...artifact,repository:"/other"},
  {...artifact,candidateId:"other"},
  {...artifact,revision:"other"}
 ])assert.throws(()=>bindPiArtifactIdentity(completed(assistant(JSON.stringify(forged))),request),/mismatched/);
});

test("candidate-free Pi output cannot acquire artifact provenance",()=>{
 const request={id:"task:explorer",role:"explorer" as const,prompt:"x",repository:"/repo"};
 assert.throws(()=>bindPiArtifactIdentity(completed(assistant(JSON.stringify(artifact))),request),/exact candidate/);
});

test("model cannot supply phase, role or another lifecycle identity field",()=>{
 const request={id:"task:explorer",role:"explorer" as const,prompt:"x",repository:"/repo",candidate:{id:"c",repository:"/repo",revision:"r",createdAt:"now"}};
 for(const key of ["phase","role","taskId","author","skillPaths"]){
  assert.throws(()=>bindPiArtifactIdentity(completed(assistant(JSON.stringify({...artifact,[key]:"spoofed"}))),request),/unsupported fields/);
 }
});
