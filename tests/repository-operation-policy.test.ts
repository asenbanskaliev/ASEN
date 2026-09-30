import assert from "node:assert/strict";
import test from "node:test";
import {
 authorizeRepositoryOperation,executeAuthorizedRead,executeOneAttempt,isRepositoryOperationAuthority,planProtectedLabelMutation,
 type RepositoryOperationAction,type RepositoryOperationBinding,type RepositoryOperationAuthority,
} from "../src/repository/operation-policy.js";

const actions:RepositoryOperationAction[]=["remote_read","issue_create","issue_update","branch_create","commit","push","pr_open","pr_update","label_mutate","merge","force_update"];
let sequence=0;
const binding=(action:RepositoryOperationAction="issue_update",sessionId=`session-${++sequence}`,host="github.example"):RepositoryOperationBinding=>({host,owner:"acme",repository:"app",sessionId,actor:"maintainer",action});
const issue=(action:RepositoryOperationAction="issue_update",sessionId?:string,host?:string)=>authorizeRepositoryOperation(binding(action,sessionId,host));
const expected=(authority:RepositoryOperationAuthority):RepositoryOperationBinding=>({host:authority.host,owner:authority.owner,repository:authority.repository,sessionId:authority.sessionId,actor:authority.actor,action:authority.action});
const run=(authority:RepositoryOperationAuthority,operationResult:unknown,readResult:unknown,events:string[]=[])=>executeOneAttempt(authority,expected(authority),async target=>{events.push(`operation:${JSON.stringify(target)}`);if(operationResult instanceof Error)throw operationResult;return operationResult as never;},async target=>{events.push(`readback:${JSON.stringify(target)}`);if(readResult instanceof Error)throw readResult;return readResult as never;});

async function consume(authority:RepositoryOperationAuthority):Promise<void>{
 if(authority.action==="remote_read")await executeAuthorizedRead(authority,expected(authority),()=>undefined);
 else await executeOneAttempt(authority,expected(authority),()=>({status:"rejected"}),()=>({state:"unchanged"}));
}

test("issues immutable normalized exact targets and rejects ambiguous fields",async()=>{
 for(const action of actions){
  const input=binding(action,undefined,"GitHub.Example."),original={...input};const authority=authorizeRepositoryOperation(input);(input as {host:string}).host="other.example";
  assert.equal(isRepositoryOperationAuthority(authority),true);assert.equal(Object.isFrozen(authority),true);assert.equal(authority.host,"github.example");
  assert.deepEqual(expected(authority),{...original,host:"github.example"});assert.equal("credentials" in authority,false);
  assert.throws(()=>{(authority as {host:string}).host="other.example";},TypeError);await consume(authority);
 }
 for(const invalid of [
  {...binding(),host:""},{...binding(),owner:""},{...binding(),repository:""},{...binding(),sessionId:""},{...binding(),actor:""},
  {...binding(),host:"https://github.example"},{...binding(),host:"github.example/acme"},{...binding(),host:"github.example.."},{...binding(),host:"github.example:443"},
  {...binding(),host:"git hub.example"},{...binding(),owner:"host/acme"},{...binding(),repository:"acme/app"},{...binding(),owner:"acme\\other"},{...binding(),actor:"two actors"},{...binding(),action:"issue"},
 ])assert.throws(()=>authorizeRepositoryOperation(invalid as never),/explicit|supported/);
 assert.equal(isRepositoryOperationAuthority({...binding()}),false);
});

test("rejects inherited, extra, symbol, and accessor bindings without invoking getters",()=>{
 let gets=0;const accessor={...binding("commit")};Object.defineProperty(accessor,"actor",{enumerable:true,get(){gets++;return "maintainer";}});for(const invalid of [Object.assign(Object.create(binding("commit")),{}),{...binding("commit"),extra:true},Object.assign({...binding("commit")},{[Symbol("extra")]:true}),accessor])assert.throws(()=>authorizeRepositoryOperation(invalid as never),/plain/);assert.equal(gets,0);
});

test("normalizes host identity and prevents duplicate live issuance until consumption",async()=>{
 const id="duplicate-session",authority=issue("issue_update",id,"GitHub.Example.");
 assert.throws(()=>issue("issue_update",id,"github.example"),/live authority/);
 const result=await executeOneAttempt(authority,binding("issue_update",id,"GITHUB.EXAMPLE."),()=>({status:"rejected"}),()=>({state:"unchanged"}));
 assert.equal(result.classification,"no_write");
 const fresh=issue("issue_update",id,"github.example");assert.notEqual(fresh,authority);await consume(fresh);
});

test("forgery, mismatch, wrong executor, and second use make zero callbacks and consume issued authority",async()=>{
 const forged={...binding()} as RepositoryOperationAuthority,forgedEvents:string[]=[];
 await assert.rejects(()=>run(forged,{status:"accepted"},{state:"intended"},forgedEvents),/issued/);assert.equal(forgedEvents.length,0);
 const mismatched=issue(),mismatchEvents:string[]=[];
 await assert.rejects(()=>executeOneAttempt(mismatched,{...expected(mismatched),repository:"other"},()=>{mismatchEvents.push("operation");return {status:"accepted"};},()=>{mismatchEvents.push("readback");return {state:"intended"};}),/binding/);
 assert.equal(mismatchEvents.length,0);await assert.rejects(()=>run(mismatched,{status:"accepted"},{state:"intended"}),/consumed/);
 const replacement=authorizeRepositoryOperation(expected(mismatched));await consume(replacement);
 const read=issue("remote_read"),wrongEvents:string[]=[];
 await assert.rejects(()=>executeOneAttempt(read,expected(read),()=>{wrongEvents.push("operation");return {status:"accepted"};},()=>{wrongEvents.push("readback");return {state:"intended"};}),/mutation/);
 assert.equal(wrongEvents.length,0);await assert.rejects(()=>executeAuthorizedRead(read,expected(read),()=>wrongEvents.push("read")),/consumed/);
});

test("passes the sole immutable frozen binding to one operation and one readback",async()=>{
 const authority=issue("pr_update"),target=expected(authority),calls:Array<{kind:string;args:unknown[]}>=[];
 const result=await executeOneAttempt(authority,{...target,host:"GITHUB.EXAMPLE."},function(...args){calls.push({kind:"operation",args});assert.equal(Object.isFrozen(args[0]),true);assert.throws(()=>{(args[0] as {actor:string}).actor="other";},TypeError);return {status:"accepted"};},function(...args){calls.push({kind:"readback",args});return {state:"intended"};});
 assert.equal(result.classification,"confirmed");assert.equal(Object.isFrozen(result),true);assert.deepEqual(calls,[{kind:"operation",args:[target]},{kind:"readback",args:[target]}]);
 assert.deepEqual(calls[0]?.args[0],{host:"github.example",owner:"acme",repository:"app",sessionId:authority.sessionId,actor:"maintainer",action:"pr_update"});
 await assert.rejects(()=>run(authority,{status:"accepted"},{state:"intended"}),/consumed/);assert.equal(calls.length,2);
});

test("classifies sync and async operation/readback failures without retries or secret leakage",async()=>{
 const cases=[
  [{status:"accepted"},{state:"intended"},"confirmed"],
  [{status:"rejected",reasonCode:"policy_denied"},{state:"unchanged"},"no_write"],
  [{status:"rejected"},{state:"drift"},"unknown"],
  [new Error("timeout SECRET"),{state:"unchanged"},"unknown"],
  [{status:"accepted"},new Error("read SECRET"),"unknown"],
 ] as const;
 for(const [operation,readback,classification] of cases){const events:string[]=[];const authority=issue();const result=await run(authority,operation,readback,events);assert.equal(result.classification,classification);assert.equal(events.length,2);assert.equal(JSON.stringify(result).includes("SECRET"),false);const fresh=authorizeRepositoryOperation(expected(authority));await consume(fresh);}
 const sync=issue(),syncEvents:string[]=[];const syncResult=await executeOneAttempt(sync,expected(sync),()=>{syncEvents.push("operation");throw new Error("sync SECRET");},()=>{syncEvents.push("readback");throw new Error("sync read SECRET");});
 assert.deepEqual(syncEvents,["operation","readback"]);assert.deepEqual(syncResult,{classification:"unknown",operationReason:"operation_threw",readBackReason:"readback_failed"});
 const asyncAuthority=issue();const asyncResult=await executeOneAttempt(asyncAuthority,expected(asyncAuthority),async()=>{throw new Error("async SECRET");},async()=>{throw new Error("async read SECRET");});
 assert.deepEqual(asyncResult,syncResult);
});

test("classifies ambiguous 5xx, accepted unchanged, and ambiguous timeout or error with exact readback",async()=>{
 const cases=[
  [{status:"ambiguous",reasonCode:"http_5xx"},{state:"unchanged",reasonCode:"exact_unchanged"},{classification:"unknown",operationReason:"http_5xx",readBackReason:"exact_unchanged"}],
  [{status:"accepted"},{state:"unchanged"},{classification:"unknown",operationReason:"accepted",readBackReason:"exact_unchanged"}],
  [{status:"ambiguous",reasonCode:"timeout"},{state:"intended",reasonCode:"exact_intended"},{classification:"confirmed",operationReason:"timeout",readBackReason:"exact_intended"}],
  [new Error("upstream body bearer SECRET"),{state:"intended",reasonCode:"exact_intended"},{classification:"confirmed",operationReason:"operation_threw",readBackReason:"exact_intended"}],
 ] as const;
 for(const [operation,readback,outcome] of cases){
  const authority=issue(),target=expected(authority),events:string[]=[];
  assert.deepEqual(await run(authority,operation,readback,events),outcome);
  assert.deepEqual(events,[`operation:${JSON.stringify(target)}`,`readback:${JSON.stringify(target)}`]);
  assert.equal(JSON.stringify(outcome).includes("SECRET"),false);
 }
});

test("malformed operation and readback records fail closed without invoking getters",async()=>{
 let gets=0;const operation={status:"accepted",extra:true},observed={state:"intended"};Object.defineProperty(observed,"state",{enumerable:true,get(){gets++;return "intended";}});const result=await run(issue("commit"),operation,observed);assert.deepEqual(result,{classification:"unknown",operationReason:"malformed_operation",readBackReason:"malformed_readback"});assert.equal(gets,0);
});

test("preserves sanitized reason codes only",async()=>{
 const safe=await run(issue(),{status:"rejected",reasonCode:"policy_denied-2"},{state:"unchanged",reasonCode:"exact_unchanged"});assert.equal(safe.operationReason,"policy_denied-2");assert.equal(safe.readBackReason,"exact_unchanged");
 const unsafe=await run(issue(),{status:"accepted",reasonCode:"candidate body: bearer SECRET"},{state:"unconfirmed",reasonCode:"response SECRET"});assert.equal(unsafe.operationReason,"redacted");assert.equal(unsafe.readBackReason,"redacted");assert.equal(JSON.stringify(unsafe).includes("SECRET"),false);
});

test("executes authorized remote reads once with exact frozen binding",async()=>{
 const authority=issue("remote_read"),target=expected(authority),calls:unknown[][]=[];
 const value=await executeAuthorizedRead(authority,{...target,host:"GITHUB.EXAMPLE."},function(...args){calls.push(args);assert.equal(Object.isFrozen(args[0]),true);return {value:42};});
 assert.deepEqual(value,{value:42});assert.deepEqual(calls,[[target]]);await assert.rejects(()=>executeAuthorizedRead(authority,target,()=>0),/consumed/);assert.equal(calls.length,1);
 const mutation=issue("merge"),events:string[]=[];await assert.rejects(()=>executeAuthorizedRead(mutation,expected(mutation),()=>events.push("read")),/remote_read/);assert.equal(events.length,0);
});

test("read mismatch, forgery, and reader errors produce no extra reads and consume issued authority",async()=>{
 const authority=issue("remote_read"),events:string[]=[];
 await assert.rejects(()=>executeAuthorizedRead(authority,{...expected(authority),actor:"other"},()=>events.push("read")),/binding/);assert.equal(events.length,0);
 await assert.rejects(()=>executeAuthorizedRead(authority,expected(authority),()=>events.push("read")),/consumed/);assert.equal(events.length,0);
 const forged={...binding("remote_read")} as RepositoryOperationAuthority;await assert.rejects(()=>executeAuthorizedRead(forged,forged,()=>events.push("read")),/issued/);assert.equal(events.length,0);
 const failures=[
  ()=>{events.push("sync");throw {message:"sync SECRET",body:"private body"};},
  async()=>{events.push("async");throw new Error("async bearer SECRET");},
 ];
 for(const reader of failures){
  const failing=issue("remote_read");
  const readCount:number=events.length;
  await assert.rejects(()=>executeAuthorizedRead(failing,expected(failing),reader),error=>error instanceof Error&&error.message==="Authorized read failed"&&!JSON.stringify(error).includes("SECRET")&&!JSON.stringify(error).includes("private body"));
  assert.equal(events.length,readCount+1);
  await assert.rejects(()=>executeAuthorizedRead(failing,expected(failing),reader),/consumed/);assert.equal(events.length,readCount+1);
 }
 assert.deepEqual(events,["sync","async"]);
});

test("plans case-insensitive protected label changes without mutating caller arrays",()=>{
 const currentLabels=["Bug","keep","Type:Old"],add=["SIZE:Exception","Type:New"],remove=["TYPE:OLD"],protectedLabels=["size:exception","type:new","type:old"];
 const before=structuredClone({currentLabels,add,remove,protectedLabels});
 for(const actorPermission of ["MAINTAIN","ADMIN"] as const){
  const plan=planProtectedLabelMutation({currentLabels,add,remove,protectedLabels,actorPermission,rationale:"Large generated evidence is required."});
  assert.deepEqual(plan,{add:["SIZE:Exception","Type:New"],remove:["TYPE:OLD"],expectedFinalLabels:["Bug","keep","SIZE:Exception","Type:New"]});
  assert.equal(Object.isFrozen(plan)&&Object.isFrozen(plan.add)&&Object.isFrozen(plan.remove)&&Object.isFrozen(plan.expectedFinalLabels),true);
 }
 assert.deepEqual({currentLabels,add,remove,protectedLabels},before);
});

test("rejects case and NFC-variant duplicate, overlap, protected-permission, and rationale bypasses",()=>{
 const base={currentLabels:["bug"],add:["Protected"],remove:[],protectedLabels:["protected"],actorPermission:"MAINTAIN" as const},composed="café",decomposed="cafe\u0301";
 for(const duplicate of [{...base,add:["protected","PROTECTED"]},{...base,currentLabels:["bug","BUG"]},{...base,protectedLabels:["protected","PROTECTED"]},{...base,add:[composed,decomposed]}])assert.throws(()=>planProtectedLabelMutation(duplicate),/duplicate/);
 assert.throws(()=>planProtectedLabelMutation({...base,add:["Protected"],remove:["pRoTeCtEd"]}),/overlap/);assert.throws(()=>planProtectedLabelMutation({...base,add:[composed],remove:[decomposed]}),/overlap/);
 for(const actorPermission of ["WRITE","TRIAGE","READ","UNVERIFIED"] as const){assert.throws(()=>planProtectedLabelMutation({...base,add:["PROTECTED"],actorPermission}),/permission/);assert.throws(()=>planProtectedLabelMutation({...base,add:[decomposed],protectedLabels:[composed],actorPermission}),/permission/);}
 assert.throws(()=>planProtectedLabelMutation({...base,add:["SIZE:EXCEPTION"],protectedLabels:["size:exception"]}),/rationale/);
 assert.throws(()=>planProtectedLabelMutation({...base,add:["SIZE:EXCEPTION"],protectedLabels:["size:exception"],rationale:"   "}),/rationale/);
 const removal=planProtectedLabelMutation({currentLabels:["Bug","Keep"],add:[decomposed],remove:["bUG"],protectedLabels:[],actorPermission:"READ"});assert.deepEqual(removal.add,[composed]);assert.deepEqual(removal.expectedFinalLabels,[composed,"Keep"]);
});
