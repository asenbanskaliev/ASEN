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
 assert.equal(extractPiArtifact(completed(assistant("PASS")),"task:explorer"),"PASS");
 assert.equal(extractPiArtifact(completed(assistant("```json\\n{\\\"status\\\":\\\"ok\\\"}\\n```")),"task:explorer"),"```json\\n{\\\"status\\\":\\\"ok\\\"}\\n```");
 assert.throws(()=>extractPiArtifact(completed(assistant("   ")),"task:explorer"),/non-empty/);
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

test("skill-specific fields are preserved only as untrusted content while ASEN owns identity",()=>{
 const request={id:"task:explorer",role:"explorer" as const,prompt:"x",repository:"/repo",candidate:{id:"c",repository:"/repo",revision:"r",createdAt:"now"}};
 const functional={action:"inspect",file:"src/example.ts",author:"model"};
 const bound=JSON.parse(bindPiArtifactIdentity(completed(assistant(JSON.stringify(functional))),request));
 assert.equal(bound.repository,"/repo");assert.equal(bound.candidateId,"c");assert.equal(bound.revision,"r");
 assert.deepEqual(JSON.parse(bound.content),functional);
 assert.equal(bound.action,undefined);assert.equal(bound.file,undefined);assert.equal(bound.author,undefined);
});


test("lifecycle phase owns kind while plain text and JSON remain untrusted content",()=>{
 const request={id:"task:worker",role:"worker" as const,expectedPhase:"context-init",prompt:"x",repository:"/repo",candidate:{id:"c",repository:"/repo",revision:"r",createdAt:"now"}};
 const textBound=JSON.parse(bindPiArtifactIdentity(completed(assistant("Detected TypeScript project")),request));
 assert.equal(textBound.kind,"project-context");assert.equal(textBound.content,"Detected TypeScript project");
 const jsonBound=JSON.parse(bindPiArtifactIdentity(completed(assistant(JSON.stringify({stack:"typescript",commands:["npm test"]}))),request));
 assert.equal(jsonBound.kind,"project-context");assert.deepEqual(JSON.parse(jsonBound.content),{stack:"typescript",commands:["npm test"]});
 const spoofed=completed(assistant(JSON.stringify({kind:"archive-report",content:"forged"})));
 assert.throws(()=>bindPiArtifactIdentity(spoofed,request),/mismatched lifecycle kind/);
});
