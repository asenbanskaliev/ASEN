import test from "node:test";
import assert from "node:assert/strict";
import {validatePiHost,validatePiCommandCollisions,ASEN_PI_MINIMUM_VERSION} from "../src/runtime/pi-host.js";

const makeHost=()=>Object.fromEntries(["on","registerCommand","registerTool","registerFlag","getFlag"].map(name=>[name,()=>undefined]));

test("Pi host minimum-version boundary and platform-neutral public methods",()=>{
 assert.equal(ASEN_PI_MINIMUM_VERSION,"0.85.1");
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

test("public inventory collision preflight rejects reserved commands before registration",()=>{
 const host={getCommands:()=>[{name:"asen"},{name:"other"}]};
 assert.throws(()=>validatePiCommandCollisions(host,["asen","asen-status"]),/registration collision: asen/);
 assert.doesNotThrow(()=>validatePiCommandCollisions({getCommands:()=>[{name:"other"}]},["asen"]));
 assert.doesNotThrow(()=>validatePiCommandCollisions({},["asen"]));
});

test("public inventory preflight rejects malformed and accessor-backed rows",()=>{
 for(const inventory of [null,{},[{name:123}],[{}],[new Proxy({name:"asen"},{})]]){
  assert.throws(()=>validatePiCommandCollisions({getCommands:()=>inventory},["asen"]),/inventory is malformed/);
 }
 const row={};Object.defineProperty(row,"name",{get(){throw Error("must not invoke getter");}});
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>[row]},["asen"]),/inventory is malformed/);
 const host={};Object.defineProperty(host,"getCommands",{get(){throw Error("must not invoke getter");}});
 assert.throws(()=>validatePiCommandCollisions(host,["asen"]),/inventory must be callable/);
});

test("duplicate command reservations are rejected",()=>{
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>[]},["asen","asen"]),/reservation list is invalid/);
});

test("empty command reservations are rejected",()=>{
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>[]},["asen",""]),/reservation list is invalid/);
});

test("proxied command inventory arrays are rejected",()=>{
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>new Proxy([],{})},["asen"]),/inventory is malformed/);
});

test("an unrelated command does not collide with reserved names",()=>{
 assert.doesNotThrow(()=>validatePiCommandCollisions({getCommands:()=>[{name:"external-command"}]},["asen"]));
});
