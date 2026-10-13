import test from "node:test";import assert from "node:assert/strict";import {buildStatus,statusLines} from "../src/runtime/status.js";import {doctorChecks,doctorExitCode} from "../src/runtime/doctor.js";
test("status exposes local state without inventing authority or provider evidence",()=>{const input={agents:[],changes:[],skills:{enabled:true,count:3},historyEnabled:false,telemetryEnabled:false};const s=buildStatus(input);assert.equal(s.profile,"default");assert.equal(s.history,"opt-in");assert.equal(s.telemetry,"opt-in");assert.ok(statusLines(input,30).every(x=>x.length<=30));});
test("doctor fails closed for required local invariants and warns for unavailable registry",()=>{const checks=doctorChecks({piVersionOk:true,homeWritable:true,registryAvailable:false,profileValid:true,historyPrivate:true,telemetryConsentValid:true});assert.equal(doctorExitCode(checks),0);const bad=doctorChecks({piVersionOk:false,homeWritable:true,registryAvailable:true,profileValid:true,historyPrivate:true,telemetryConsentValid:true});assert.equal(doctorExitCode(bad),1);});

test("ECO-06 doctor reports every required local safety invariant as blocking",()=>{
 const healthy={piVersionOk:true,homeWritable:true,registryAvailable:true,profileValid:true,historyPrivate:true,telemetryConsentValid:true};
 for(const key of ["piVersionOk","homeWritable","profileValid","historyPrivate","telemetryConsentValid"] as const){
  const checks=doctorChecks({...healthy,[key]:false});
  assert.equal(doctorExitCode(checks),1,key);
 }
 assert.equal(doctorExitCode(doctorChecks({...healthy,registryAvailable:false})),0);
});
test("ECO-06 status is a read-only projection, not a dispatch authorization",()=>{
 const input={agents:[],changes:[],skills:{enabled:true,count:0},historyEnabled:false,telemetryEnabled:false};
 const before=structuredClone(input);
 const first=buildStatus(input),second=buildStatus(input);
 assert.deepEqual(input,before);
 assert.deepEqual(first,second);
 assert.equal(Object.hasOwn(first,"writerAdmission"),false);
 assert.equal(Object.hasOwn(first,"runnerWriteReceiver"),false);
});

test("ECO-06 status rendering remains bounded for long operational summaries",()=>{
 const input={agents:[],changes:[],skills:{enabled:true,count:3},historyEnabled:false,telemetryEnabled:false};
 for(const width of [24,40,80,120]){
  const lines=statusLines(input,width);
  assert.ok(lines.length>0);
  assert.ok(lines.every(line=>typeof line==="string"&&line.length<=width));
 }
});
