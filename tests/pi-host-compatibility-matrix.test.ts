import test from "node:test";
import assert from "node:assert/strict";
import {validatePiHost} from "../src/runtime/pi-host.js";

const makeHost=()=>Object.fromEntries(["on","registerCommand","registerTool","registerFlag","getFlag"].map(name=>[name,()=>undefined]));

test("Pi host minimum-version boundary and platform-neutral public methods",()=>{
 for(const version of ["0.85.1","0.86.0","0.99.9","1.0.0","1.1.0","2.0.0"])
  assert.doesNotThrow(()=>validatePiHost(makeHost(),version),version);
 for(const version of ["0.85.0","0.84.99","0.0.0","invalid","1.1.0-rc.1",undefined,null,1])
  assert.throws(()=>validatePiHost(makeHost(),version),/known Pi version/);
});

test("Pi host preflight rejects missing or accessor-backed registration methods",()=>{
 for(const name of ["on","registerCommand","registerTool","registerFlag","getFlag"]){
  const missing=makeHost();delete missing[name];
  assert.throws(()=>validatePiHost(missing,"1.1.0"),/requires callable Pi/);
  const accessor=makeHost();Object.defineProperty(accessor,name,{get(){throw Error("host getter invoked");}});
  assert.throws(()=>validatePiHost(accessor,"1.1.0"),/requires callable Pi/);
 }
 assert.throws(()=>validatePiHost(new Proxy(makeHost(),{}),"1.1.0"),/public Pi extension API/);
});
