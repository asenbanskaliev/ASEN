import test from "node:test";
import assert from "node:assert/strict";
import {validatePiHost,validatePiCommandCollisions,validatePiRegistrationCollisions,validatePiExecutionContext,ASEN_PI_MINIMUM_VERSION,ASEN_PI_MAXIMUM_VERSION_EXCLUSIVE,ASEN_PI_SUPPORTED_MODES} from "../src/runtime/pi-host.js";

const makeHost=()=>Object.assign(Object.fromEntries(["on","registerCommand","registerTool","getFlag","getCommands","getAllTools"].map(name=>[name,()=>name==="getCommands"||name==="getAllTools"?[]:undefined])));

test("Pi host minimum-version boundary and platform-neutral public methods",()=>{
 assert.equal(ASEN_PI_MINIMUM_VERSION,"0.85.1");
 assert.equal(ASEN_PI_MAXIMUM_VERSION_EXCLUSIVE,"2.0.0");
 for(const version of ["0.85.1","0.86.0","0.99.9","1.0.0","1.1.0","1.99.9"])
  assert.doesNotThrow(()=>validatePiHost(makeHost(),version),version);
 for(const version of ["0.85.0","0.84.99","0.0.0","2.0.0","9.1.0","invalid","1.1.0-rc.1",undefined,null,1])
  assert.throws(()=>validatePiHost(makeHost(),version),/known Pi version/);
});

test("Pi host preflight rejects missing or accessor-backed registration methods",()=>{
 for(const name of ["on","registerCommand","registerTool","getCommands","getAllTools"]){
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
 assert.throws(()=>validatePiCommandCollisions({},["asen"]),/inventory is unavailable/);
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

test("exact reserved names collide without prefix matching",()=>{
 assert.doesNotThrow(()=>validatePiCommandCollisions({getCommands:()=>[{name:"asen-extra"}]},["asen"]));
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>[{name:"asen"}]},["asen"]),/registration collision/);
});

test("host inventory rejects null entries",()=>{
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>[null]},["asen"]),/inventory is malformed/);
});

test("host inventory rejects nonstring command names",()=>{
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>[{name:42}]},["asen"]),/inventory is malformed/);
});

test("host inventory rejects missing name descriptor",()=>{
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>[{}]},["asen"]),/inventory is malformed/);
});

test("empty complete host command inventory is collision-free",()=>{
 assert.doesNotThrow(()=>validatePiCommandCollisions({getCommands:()=>[]},["asen"]));
});

test("host inventory accessor names are not evaluated",()=>{
 const entry={};Object.defineProperty(entry,"name",{get(){throw Error("unexpected access");}});
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>[entry]},["asen"]),/inventory is malformed/);
});

test("host command inventory method must be callable",()=>{
 assert.throws(()=>validatePiCommandCollisions({getCommands:null},["asen"]),/inventory must be callable/);
});

test("host command inventory rejects primitive rows",()=>{
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>["asen"]},["asen"]),/inventory is malformed/);
});

test("unrelated command names preserve case-sensitive matching",()=>{
 assert.doesNotThrow(()=>validatePiCommandCollisions({getCommands:()=>[{name:"ASEN"}]},["asen"]));
});

test("version parser rejects prefixed release strings",()=>{
 assert.throws(()=>validatePiHost(makeHost(),"v1.1.0"),/known Pi version/);
});

test("version parser rejects surrounding whitespace",()=>{
 assert.throws(()=>validatePiHost(makeHost()," 1.1.0 "),/known Pi version/);
});

test("version parser rejects incomplete versions",()=>{
 assert.throws(()=>validatePiHost(makeHost(),"1.1"),/known Pi version/);
});

test("version parser rejects release metadata",()=>{
 assert.throws(()=>validatePiHost(makeHost(),"1.1.0+build"),/known Pi version/);
});

test("host rejects missing required registration tool",()=>{
 const host=makeHost();delete host.registerTool;
 assert.throws(()=>validatePiHost(host,"1.1.0"),/callable Pi registerTool/);
});

test("local reservations are checked even without host inventory",()=>{
 assert.throws(()=>validatePiCommandCollisions({},["asen","asen"]),/reservation list is invalid/);
 assert.throws(()=>validatePiCommandCollisions({},[""]),/reservation list is invalid/);
});

test("oversized host command inventories are rejected",()=>{
 const rows:any[]=[];rows.length=100001;
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>rows},["asen"]),/inventory is malformed/);
});

test("sparse command inventory fails closed",()=>{
 const rows:any[]=new Array(2);rows[1]={name:"other"};
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>rows},["asen"]),/inventory is malformed/);
});

test("host version rejects negative major number",()=>{
 assert.throws(()=>validatePiHost(makeHost(),"-1.1.0"),/known Pi version/);
});

test("command inventory accepts multiple distinct registered commands",()=>{
 assert.doesNotThrow(()=>validatePiCommandCollisions({getCommands:()=>[{name:"one"},{name:"two"}]},["asen"]));
});

test("command collision detected beyond first inventory row",()=>{
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>[{name:"other"},{name:"asen"}]},["asen"]),/registration collision/);
});



test("undefined inventory entry is rejected",()=>{
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>[undefined]},["asen"]),/inventory is malformed/);
});

test("duplicate reservations fail before invoking host inventory",()=>{
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>{throw Error("unexpected inventory access");}},["asen","asen"]),/reservation list is invalid/);
});

test("inventory errors are propagated",()=>{
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>{throw Error("inventory error");}},["asen"]),/inventory error/);
});

test("empty reservation fails before inventory access",()=>{
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>{throw Error("should not run");}},[""]),/reservation list is invalid/);
});

test("empty command reservation list is rejected",()=>{
 assert.throws(()=>validatePiCommandCollisions({},[]),/reservation list is invalid/);
});

test("proxied command reservation arrays are rejected",()=>{
 assert.throws(()=>validatePiCommandCollisions({},new Proxy(["asen"],{})),/reservation list is invalid/);
});

test("indexed inventory accessor is rejected without execution",()=>{
 const rows:any[]=[];Object.defineProperty(rows,"0",{get(){throw Error("accessor executed");}});
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>rows},["asen"]),/inventory is malformed/);
});

test("registration admission checks command and tool inventories before mutation",()=>{
 const host:any=makeHost();host.getCommands=()=>[{name:"existing"}];host.getAllTools=()=>[{name:"existing_tool"}];
 assert.doesNotThrow(()=>validatePiRegistrationCollisions(host,["asen"],["asen_probe"]));
 host.getCommands=()=>[{name:"asen"}];
 assert.throws(()=>validatePiRegistrationCollisions(host,["asen"],["asen_probe"]),/command registration collision/);
 host.getCommands=()=>[];host.getAllTools=()=>[{name:"asen_probe"}];
 assert.throws(()=>validatePiRegistrationCollisions(host,["asen"],["asen_probe"]),/tool registration collision/);
});

test("missing and incomplete command/tool inventories fail closed",()=>{
 const host:any=makeHost();host.getCommands=undefined;
 assert.throws(()=>validatePiRegistrationCollisions(host,["asen"],["asen_probe"]),/command inventory must be callable/);
 host.getCommands=()=>[];host.getAllTools=()=>new Array(1);
 assert.throws(()=>validatePiRegistrationCollisions(host,["asen"],["asen_probe"]),/tool inventory is malformed/);
 const accessor={};Object.defineProperty(accessor,"name",{get(){throw Error("getter ran");}});
 host.getAllTools=()=>[];host.getCommands=()=>[accessor];
 assert.throws(()=>validatePiRegistrationCollisions(host,["asen"],["asen_probe"]),/command inventory is malformed/);
});

test("execution contexts admit only documented public modes and boolean UI capability",()=>{
 for(const mode of ASEN_PI_SUPPORTED_MODES)assert.doesNotThrow(()=>validatePiExecutionContext({mode,hasUI:mode==="tui"||mode==="rpc"}));
 for(const context of [{mode:"unknown",hasUI:false},{mode:"rpc"},{mode:"rpc",hasUI:"yes"},null,{}])
  assert.throws(()=>validatePiExecutionContext(context),/public Pi execution context|execution mode or context/);
 let reads=0;const publicContext={get mode(){reads++;return "rpc";},get hasUI(){return false;}};
 assert.doesNotThrow(()=>validatePiExecutionContext(publicContext));assert.equal(reads,1,"Pi exposes execution-context properties through public getters");
});

test("unsafe numeric Pi versions fail closed",()=>{
 for(const version of ["9007199254740992.0.0","1.9007199254740992.0","1.1.9007199254740992"])
  assert.throws(()=>validatePiHost(makeHost(),version),/known Pi version/);
});

test("oversized reservation arrays are rejected before inspecting host",()=>{
 const names=Array(100001).fill("asen");
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>{throw Error("unexpected host access");}},names),/reservation list is invalid/);
});

test("malformed host command names are not silently accepted",()=>{
 for(const name of ["", " asen", "asen "])
  assert.throws(()=>validatePiCommandCollisions({getCommands:()=>[{name}]},["asen"]),/inventory is malformed/);
});

test("registration names reject control characters before host mutation",()=>{
 for(const name of ["asen\n","asen\u0000","asen\u007f"]){
  assert.throws(()=>validatePiCommandCollisions({getCommands:()=>[]},[name]),/reservation list is invalid/);
  assert.throws(()=>validatePiCommandCollisions({getCommands:()=>[{name}]},["asen"]),/inventory is malformed/);
 }
});

test("reservation array accessors are rejected without invoking getters",()=>{
 const names:string[]=["asen"];
 Object.defineProperty(names,"0",{get(){throw Error("reservation getter invoked");}});
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>[]},names),/reservation list is invalid/);
});

test("sparse reservation arrays are rejected before host inventory lookup",()=>{
 const names:string[]=new Array(1);
 assert.throws(()=>validatePiCommandCollisions({getCommands:()=>{throw Error("unexpected lookup");}},names),/reservation list is invalid/);
});
