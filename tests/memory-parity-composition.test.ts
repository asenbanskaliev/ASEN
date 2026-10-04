import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import test from "node:test";
// @ts-expect-error Dependency-free offline JavaScript seam.
import {additionalParityFixturePaths,additionalParitySlices,composeAdditionalParitySlices,validateAdditionalParitySlices} from "../scripts/memory-parity/additional-slices.mjs";
// @ts-expect-error Dependency-free offline JavaScript registry.
import {writerAParitySlices} from "../scripts/memory-parity/writer-a/index.mjs";
// @ts-expect-error Dependency-free offline JavaScript registry.
import {writerBParitySlices} from "../scripts/memory-parity/writer-b/index.mjs";

const descriptor=(id:string,fixturePath=`registry/parity/${id}.json`,overrides={})=>Object.freeze({id,fixturePath,load:()=>({}),validate:()=>[],successLabel:`${id} contracts`,...overrides});
const registries=(a:unknown[],b:unknown[])=>Object.freeze([Object.freeze({writer:"A",slices:Object.freeze(a)}),Object.freeze({writer:"B",slices:Object.freeze(b)})]);

test("empty frozen writer registries preserve the composition baseline",()=>{
 for(const value of [writerAParitySlices,writerBParitySlices,additionalParitySlices,additionalParityFixturePaths]){
  assert.equal(Object.isFrozen(value),true);assert.deepEqual(value,[]);
 }
 const result=spawnSync(process.execPath,["scripts/audit-memory-parity.mjs"],{encoding:"utf8"});
 assert.equal(result.status,0);assert.equal(result.stderr,"");
 assert.equal(result.stdout.trim(),"memory parity reference: PASS (2 targets, 7 sources, 18 baseline families; 8 foundation, 5 observation-write, 6 retrieval/search, 5 context/timeline, 7 project-identity, 3 session-transport, 15 session-store, 3 passive-capture, and 1 relation source-inspected contracts; no runtime parity claim)");
});

test("composer preserves writer A then writer B and freezes the result",()=>{
 const a=descriptor("writer-a"),b=descriptor("writer-b");
 const result=composeAdditionalParitySlices(registries([a],[b]));
 assert.equal(Object.isFrozen(result),true);assert.deepEqual(result,[a,b]);
});

test("composer rejects reversed registries, duplicates, and unsafe fixture paths",()=>{
 assert.throws(()=>composeAdditionalParitySlices(Object.freeze([Object.freeze({writer:"B",slices:Object.freeze([])}),Object.freeze({writer:"A",slices:Object.freeze([])})])),/writer A.*writer B/i);
 assert.throws(()=>composeAdditionalParitySlices(registries([descriptor("same")],[descriptor("same","registry/parity/other.json")])),/duplicate descriptor id/i);
 assert.throws(()=>composeAdditionalParitySlices(registries([descriptor("one")],[descriptor("two","registry/parity/one.json")])),/duplicate fixture path/i);
 for(const path of ["registry/parity/nested/x.json","registry/parity/../x.json","other/x.json","registry/parity/x.js"])
  assert.throws(()=>composeAdditionalParitySlices(registries([descriptor("unsafe",path)],[])),/canonical registry\/parity/i);
});

test("composer requires the frozen descriptor contract",()=>{
 const mutable={...descriptor("mutable")};
 assert.throws(()=>composeAdditionalParitySlices(registries([mutable],[])),/frozen descriptor/i);
 assert.throws(()=>composeAdditionalParitySlices(registries([descriptor("bad",undefined,{validate:1})],[])),/validate/i);
});

test("additional validation contains malformed slice failures and continues deterministically",()=>{
 const slices=[descriptor("load-failure",undefined,{load:()=>{throw new Error("broken JSON");}}),descriptor("throwing-validator",undefined,{validate:()=>{throw new Error("bad shape");}}),descriptor("bad-return",undefined,{validate:()=>[1]}),descriptor("later",undefined,{validate:()=>["later issue"]})];
 assert.deepEqual(validateAdditionalParitySlices("/offline",slices),["load-failure: load failed: broken JSON","throwing-validator: validation failed: bad shape","bad-return: validator must return string[]","later: later issue"]);
});

test("additional validation contains hostile thrown values and still runs later descriptors",()=>{
 const hostile=Object.freeze(Object.create(null));
 const executed:string[]=[];
 const slices=[descriptor("hostile-load",undefined,{load:()=>{throw hostile;}}),descriptor("hostile-validator",undefined,{validate:()=>{throw hostile;}}),descriptor("later-hostile",undefined,{validate:()=>{executed.push("later-hostile");return ["later issue"];}})];
 assert.deepEqual(validateAdditionalParitySlices("/offline",slices),["hostile-load: load failed: [unprintable thrown value]","hostile-validator: validation failed: [unprintable thrown value]","later-hostile: later issue"]);
 assert.deepEqual(executed,["later-hostile"]);
});

test("composition uses static A-then-B imports and audit keeps the ten-validator prefix",()=>{
 const seam=readFileSync("scripts/memory-parity/additional-slices.mjs","utf8");
 assert.ok(seam.indexOf("writer-a/index.mjs")<seam.indexOf("writer-b/index.mjs"));assert.doesNotMatch(seam,/import\s*\(/);
 const audit=readFileSync("scripts/audit-memory-parity.mjs","utf8");
 const validators=["validateMemoryParity(","validateMemoryFoundation(","validateMemoryObservationWrites(","validateMemoryRetrievalSearch(","validateMemoryContextTimeline(","validateMemoryProjectIdentity(","validateMemorySessionTransport(","validateMemorySessionStore(","validateMemoryPassiveCapture(","validateMemoryRelations(","validateAdditionalParitySlices("];
 let cursor=-1;for(const validator of validators){const next=audit.indexOf(validator,cursor+1);assert.ok(next>cursor,`${validator} must follow the prior validator`);cursor=next;}
});
