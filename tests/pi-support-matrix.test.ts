import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error CI-only matrix planner.
import {planPiSupportMatrix,validateCellObservation} from "../scripts/pi-support-matrix.mjs";

test("support matrix selects exactly 24 distinct public host cells",()=>{
 const cells=planPiSupportMatrix();
 assert.equal(cells.length,24);
 assert.equal(new Set(cells.map((c:{id:string})=>c.id)).size,24);
 for(const platform of ["linux","win32","darwin"])assert.equal(cells.filter((c:{platform:string})=>c.platform===platform).length,8);
});

test("matrix admission rejects forced exit, model calls and missing host inventory",()=>{
 const cell=planPiSupportMatrix()[0];
 const valid={mode:cell.mode,hasUI:true,commands:["asen"],tools:["asen_ask_choice"],modelCalls:0,shutdownObserved:true,exitCode:0,signal:null,timedOut:false};
 assert.doesNotThrow(()=>validateCellObservation(cell,valid));
 for(const patch of [{mode:"unknown"},{commands:[]},{tools:[]},{modelCalls:1},{shutdownObserved:false},{exitCode:1},{signal:"SIGTERM"},{timedOut:true}])
  assert.throws(()=>validateCellObservation(cell,{...valid,...patch}));
});
