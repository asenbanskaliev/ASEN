import assert from "node:assert/strict";
import test from "node:test";
import {projectJobMetadata,renderJobInspection,jobInspectionLabel,inspectOwnedJob} from "../src/runtime/job-inspect.js";
import type {BackgroundJobSnapshot} from "../src/runtime/background-jobs.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";

const secret="SECRET_SENTINEL";
const row=(extra:Record<string,unknown>={}):BackgroundJobSnapshot=>({id:"job-1",sessionId:"s",projectId:"p",mode:"background",state:"running",createdAt:"2026-11-05T00:00:00Z",updatedAt:"2026-11-05T00:00:01Z",exitCode:null,eventCount:3,command:secret,args:[secret],cwd:secret,tail:[secret],persistenceError:secret,deliveryError:secret,authorizationId:secret,...extra});

test("allowlisted metadata and public rendering withhold all execution payloads",()=>{
 const metadata=projectJobMetadata(row());
 assert.deepEqual(Object.keys(metadata).sort(),["id","mode","state","createdAt","updatedAt","exitCode","eventCount","retainedLineCount","provenance"].sort());
 assert.doesNotMatch(JSON.stringify(metadata),/SECRET_SENTINEL|command|args|cwd|tail|Error|authorization/);
 assert.match(renderJobInspection(metadata).join("\n"),/observed at inspection; not live follow/);
 assert.match(renderJobInspection(metadata).join("\n"),/Logs withheld: safe projection unavailable/);
 assert.equal(jobInspectionLabel(metadata),"job-1 · background · running");
 for(const width of [12,40,72]){
  const text=renderJobInspection(projectJobMetadata(row({id:"\x1b[2J"+"界".repeat(400)+"\n\u202e"})),width);
  assert.ok(text.every(line=>visibleWidth(line)<=width&&!/[\x00-\x1f\u202e]/u.test(line)));
  assert.doesNotMatch(text.join("\n"),new RegExp(secret));
 }
});

test("recovered metadata and counts are historical; interruption never implies resumption or outcome",()=>{
 const metadata=projectJobMetadata(row({state:"interrupted",recoveredAt:"2026-11-06T00:00:00Z",resumable:false,eventCount:0}));
 const text=renderJobInspection(metadata,100).join("\n");
 assert.equal(metadata.provenance,"journal-historical");
 assert.match(text,/historical; current execution unknown/);
 assert.match(text,/outcome uncertain; not resumed/);
 assert.match(text,/Historical events: 0/);
 assert.match(text,/Historical retained lines: 1/);
 assert.doesNotMatch(text,/succeeded|live follow active/i);
 const invalid=projectJobMetadata(row({mode:secret,state:secret,createdAt:secret,updatedAt:secret,eventCount:-1,exitCode:Infinity}));
 assert.doesNotMatch(JSON.stringify(invalid),new RegExp(secret));
 assert.equal(invalid.exitCode,null);assert.equal(invalid.eventCount,null);
});

test("owned inspection distinguishes failure and empty, rejects foreign identically and cancels",async()=>{
 const base={identity:{sessionId:"s",projectId:"p"},assertCurrent:async()=>{},width:72};
 const inspect=(id:string,rows:readonly BackgroundJobSnapshot[])=>inspectOwnedJob({...base,id,read:()=>rows});
 assert.deepEqual(await inspect("unknown",[row()]),await inspect("foreign",[row({id:"foreign",sessionId:"other"})]));
 assert.match((await inspect("",[])).join(""),/No owned jobs/);
 assert.match((await inspectOwnedJob({...base,id:"",read:()=>{throw Error(secret);}})).join(""),/reader unavailable/);
 assert.match((await inspectOwnedJob({...base,id:"",read:()=>[row()],select:async()=>undefined})).join(""),/closed/);
 const controller=new AbortController();controller.abort();let reads=0;
 assert.match((await inspectOwnedJob({...base,id:"job-1",read:()=>{reads++;return [row()];},signal:controller.signal})).join(""),/closed/);
 assert.equal(reads,0);
});

test("scope is revalidated after asynchronous reader and selection, before display",async()=>{
 for(const stage of ["read","select"]){
  let current=true;
  const result=await inspectOwnedJob({id:stage==="read"?"job-1":"",identity:{sessionId:"s",projectId:"p"},width:72,
   assertCurrent:async()=>{if(!current)throw Error(secret);},
   read:async()=>{if(stage==="read")current=false;return [row()];},
   select:async(_title,options)=>{current=false;return options[0];}});
  assert.match(result.join(""),/unavailable/);assert.doesNotMatch(result.join(""),/job-1|SECRET_SENTINEL/);
 }
});
