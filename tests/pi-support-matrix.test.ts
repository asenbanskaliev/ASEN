import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error CI-only matrix planner.
import {planPiSupportMatrix,validateCellObservation} from "../scripts/pi-support-matrix.mjs";

test("support matrix selects exactly 12 distinct Pi 1.2.0 host cells",()=>{
 const cells=planPiSupportMatrix();
 assert.equal(cells.length,12);
 assert.deepEqual([...new Set(cells.map((c:{version:string})=>c.version))],["1.2.0"]);
 assert.equal(new Set(cells.map((c:{id:string})=>c.id)).size,12);
 for(const platform of ["linux","win32","darwin"])assert.equal(cells.filter((c:{platform:string})=>c.platform===platform).length,4);
});

test("support matrix derives its floor and development witnesses from the uncapped package contract",()=>{
 const metadata={
  peerDependencies:{"@earendil-works/pi-coding-agent":">=1.2.0"},
  devDependencies:{"@earendil-works/pi-coding-agent":"^2.0.0"},
 };
 const cells=planPiSupportMatrix(metadata as any);
 assert.deepEqual([...new Set(cells.map((c:{version:string})=>c.version))],["1.2.0","2.0.0"]);
 assert.equal(cells.length,24);
});

test("support matrix deduplicates a peer floor that matches the development version",()=>{
 const metadata={
  peerDependencies:{"@earendil-works/pi-coding-agent":">=1.2.3"},
  devDependencies:{"@earendil-works/pi-coding-agent":"^1.2.3"},
 };
 const cells=planPiSupportMatrix(metadata as any);
 assert.equal(new Set(cells.map((c:{version:string})=>c.version)).size,1);
 assert.equal(cells.length,12);
 for(const platform of ["linux","win32","darwin"])assert.equal(cells.filter((c:{platform:string})=>c.platform===platform).length,4);
});

test("support matrix rejects malformed or below-floor Pi version contracts",()=>{
 const base={
  peerDependencies:{"@earendil-works/pi-coding-agent":">=1.2.0"},
  devDependencies:{"@earendil-works/pi-coding-agent":"^1.2.3"},
 };
 assert.throws(()=>planPiSupportMatrix({...base,peerDependencies:{"@earendil-works/pi-coding-agent":">=1.2"}}),/exact minimum/);
 assert.throws(()=>planPiSupportMatrix({...base,devDependencies:{"@earendil-works/pi-coding-agent":"^1.1.0"}}),/at or above the declared peer dependency floor/);
});

test("matrix admission rejects forced exit, model calls and missing host inventory",()=>{
 const cell=planPiSupportMatrix()[0];
 const valid={mode:cell.mode,hasUI:true,commands:["asen"],tools:["asen_ask_choice","ask_user_choice","ask_user_question"],modelCalls:0,shutdownObserved:true,exitCode:0,signal:null,timedOut:false,keyboardCommandObserved:true};
 assert.doesNotThrow(()=>validateCellObservation(cell,valid));
 for(const patch of [{mode:"unknown"},{commands:[]},{tools:[]},{tools:["asen_ask_choice"]},{modelCalls:1},{shutdownObserved:false},{exitCode:1},{signal:"SIGTERM"},{timedOut:true},{keyboardCommandObserved:false}])
  assert.throws(()=>validateCellObservation(cell,{...valid,...patch}));
});
