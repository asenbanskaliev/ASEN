import assert from "node:assert/strict";
import test from "node:test";
import asen from "../extensions/asen.js";
import {validatePiHost} from "../src/runtime/pi-host.js";

test("primary factory rejects missing host capabilities before any registration",()=>{
  for(const missing of ["on","registerCommand","registerTool","registerFlag","getFlag"]){
    let writes=0;
    const host:any={on(){writes++;},registerCommand(){writes++;},registerTool(){writes++;},registerFlag(){writes++;},getFlag(){return false;}};
    delete host[missing];
    assert.throws(()=>asen(host),/ASEN.*Pi/);
    assert.equal(writes,0,`${missing} must fail before registration`);
  }
});

test("preflight preserves the declared minimum and rejects unknown versions and proxies",()=>{
 const host={on(){},registerCommand(){},registerTool(){},registerFlag(){},getFlag(){return false;}};
 for(const version of ["0.85.1","0.87.1","1.1.0"])assert.doesNotThrow(()=>validatePiHost(host,version));
 for(const version of [undefined,"unknown","0.85.0","1.1.0-beta","garbage 1.1.0",1.1])assert.throws(()=>validatePiHost(host,version),/known Pi version/);
 let traps=0;const proxy=new Proxy(host,{getOwnPropertyDescriptor(){traps++;throw new Error("must not execute");}});
 assert.throws(()=>validatePiHost(proxy,"1.1.0"),/public Pi extension API/);assert.equal(traps,0);
});

test("primary factory refuses host accessors without executing them",()=>{
  let reads=0,writes=0;
  const host:any={on(){writes++;},registerTool(){writes++;},registerFlag(){writes++;},getFlag(){return false;}};
  Object.defineProperty(host,"registerCommand",{enumerable:true,get(){reads++;return ()=>writes++;}});
  assert.throws(()=>asen(host),/ASEN.*Pi/);
  assert.equal(reads,0);assert.equal(writes,0);
});
