import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {executeAuthorizedRead,isRepositoryOperationAuthority} from "../src/repository/operation-policy.js";
import {
 MAX_RDD_POLICY_BYTES,RDD_POLICY_LOCATOR,parseRddPolicy,parseRddPolicyText,type RddPolicyV1,
} from "../src/defects/rdd-policy.js";

const object=(reviewMode:"enabled"|"disabled"="enabled",requiredLabels:unknown=["defect:approved","triage:complete"]):Record<string,unknown>=>({schemaVersion:1,reviewMode,issueApproval:{requiredLabels}});
const text=(reviewMode:"enabled"|"disabled"="enabled",requiredLabels?:unknown)=>JSON.stringify(object(reviewMode,requiredLabels));

function expectedIdentity(source:string):string{
 return createHash("sha256").update("asen.rdd-policy.v1\0","utf8").update(source,"utf8").digest("hex");
}

test("parses enabled and disabled policy with arbitrary explicit labels and exact-byte identity",()=>{
 for(const mode of ["enabled","disabled"] as const){
  const source=`{\n  "schemaVersion": 1, "reviewMode": "${mode}",\n  "issueApproval": {"requiredLabels": ["accepted-by-team", "ready/quality"]}\n}`;
  const parsed=parseRddPolicyText(source);
  assert.deepEqual(parsed.policy,{schemaVersion:1,reviewMode:mode,issueApproval:{requiredLabels:["accepted-by-team","ready/quality"]}});
  assert.equal(parsed.contentIdentity,expectedIdentity(source));
  assert.equal("reviewMode" in parsed,false);
 }
 assert.equal(RDD_POLICY_LOCATOR,".asen/rdd-policy.json");
});

test("returns deeply immutable descriptive data without authority-bearing fields",async()=>{
 const parsed=parseRddPolicyText(text());
 assert.equal(Object.isFrozen(parsed),true);assert.equal(Object.isFrozen(parsed.policy),true);assert.equal(Object.isFrozen(parsed.policy.issueApproval),true);assert.equal(Object.isFrozen(parsed.policy.issueApproval.requiredLabels),true);
 assert.throws(()=>{(parsed.policy as {reviewMode:string}).reviewMode="disabled";},TypeError);
 assert.throws(()=>{(parsed.policy.issueApproval.requiredLabels as string[]).push("other");},TypeError);
 for(const forbidden of ["authority","approved","ready","deliveryReady","issue","branch","credentials","token"])assert.equal(forbidden in parsed,false);
 assert.equal(isRepositoryOperationAuthority(parsed),false);
 await assert.rejects(()=>executeAuthorizedRead(parsed as never,{host:"example.test",owner:"o",repository:"r",sessionId:"s",actor:"a",action:"remote_read"},()=>true),/issued/);
});

test("rejects missing, extra, unknown-version, and wrong scalar shapes",()=>{
 const invalid:unknown[]=[
  {},{reviewMode:"enabled",issueApproval:{requiredLabels:["x"]}},
  {...object(),schemaVersion:2},{...object(),reviewMode:"optional"},{...object(),extra:true},
  {schemaVersion:1,reviewMode:"enabled",issueApproval:{requiredLabels:["x"],extra:true}},
  {schemaVersion:"1",reviewMode:"enabled",issueApproval:{requiredLabels:["x"]}},
  {schemaVersion:1,reviewMode:"enabled",issueApproval:null},
  {schemaVersion:1,reviewMode:"enabled",issueApproval:{requiredLabels:"x"}},
  {schemaVersion:1,reviewMode:"enabled",issueApproval:{requiredLabels:[]}},
 ];
 for(const value of invalid)assert.throws(()=>parseRddPolicy(value as RddPolicyV1),/policy|schemaVersion|reviewMode|requiredLabels/i);
});

test("rejects accessors, inherited values, symbols, and non-plain objects without invoking getters",()=>{
 let gets=0;const accessor=object() as Record<string,unknown>;Object.defineProperty(accessor,"reviewMode",{enumerable:true,get(){gets++;return "enabled";}});
 const inherited=Object.assign(Object.create(object() as object),{});
 const symbol=Object.assign(object() as object,{[Symbol("extra")]:true});
 for(const value of [accessor,inherited,symbol,new (class{schemaVersion=1;reviewMode="enabled";issueApproval={requiredLabels:["x"]};})()])assert.throws(()=>parseRddPolicy(value as never),/plain data/);
 assert.equal(gets,0);
});

test("rejects sparse, accessor, prototype-modified, decorated, and huge arrays without callbacks",()=>{
 const sparse=Array(2);sparse[0]="a";
 let effects=0;const accessor=["a"];Object.defineProperty(accessor,"0",{enumerable:true,get(){effects++;throw new Error("must not run");}});
 const ownKeys=["a"];Object.defineProperty(ownKeys,"keys",{enumerable:true,get(){effects++;throw new Error("must not run");}});
 const ownFunction=Object.assign(["a"],{keys(){effects++;throw new Error("must not run");}});
 const prototype=["a"];Object.setPrototypeOf(prototype,{...Array.prototype});
 const decorated=Object.assign(["a"],{note:true});
 const symbol=Object.assign(["a"],{[Symbol("extra")]:true});
 const huge:Array<unknown>=[];huge.length=2**32-1;
 for(const labels of [sparse,accessor,ownKeys,ownFunction,prototype,decorated,symbol,huge])assert.throws(()=>parseRddPolicy(object("enabled",labels) as never),/array|plain data|limit/);
 assert.equal(effects,0);
});

test("enforces bounded canonical labels, byte order, and compatibility/case-equivalent uniqueness",()=>{
 const invalid:unknown[]=[
  [" status:approved"],["status:approved "],["cafe\u0301"],["line\nbreak"],["zero\u200bwidth"],
  ["same","same"],["bug","ｂｕｇ"],["z-label","a-label"],["ä","z"],["x".repeat(101)],Array.from({length:33},(_,i)=>`label-${String(i).padStart(2,"0")}`),
 ];
 for(const labels of invalid)assert.throws(()=>parseRddPolicy(object("enabled",labels) as never),/label|requiredLabels|canonical|order|duplicate|equivalent|limit/i);
 assert.deepEqual(parseRddPolicy(object("enabled",["a label","status:any-team-value","z","ä"]) as unknown as RddPolicyV1).issueApproval.requiredLabels,["a label","status:any-team-value","z","ä"]);
});

test("rejects malformed JSON, non-object roots, invalid Unicode, and the UTF-8 hard limit",()=>{
 for(const source of ["", "{", "null", "[]", '"string"', text().replace("defect:approved","bad\\ud800label")])assert.throws(()=>parseRddPolicyText(source),/JSON|policy|Unicode|label/i);
 const exact=" ".repeat(MAX_RDD_POLICY_BYTES);assert.throws(()=>parseRddPolicyText(exact+" "),/65536|limit/i);
 assert.throws(()=>parseRddPolicyText(exact),/JSON/i);
});

test("bounds duplicate-key lexical validation by depth and token count",()=>{
 const deep="[".repeat(65)+"0"+"]".repeat(65);
 const many=`[${Array.from({length:4100},()=>"0").join(",")}]`;
 assert.throws(()=>parseRddPolicyText(deep),/lexical depth bounds/);
 assert.throws(()=>parseRddPolicyText(many),/lexical token bounds/);
});

test("rejects duplicate JSON keys including escaped aliases without false string matches",()=>{
 const duplicates=[
  '{"schemaVersion":1,"reviewMode":"enabled","reviewMode":"disabled","issueApproval":{"requiredLabels":["x"]}}',
  '{"schemaVersion":1,"reviewMode":"enabled","review\\u004dode":"disabled","issueApproval":{"requiredLabels":["x"]}}',
  '{"schemaVersion":1,"reviewMode":"enabled","issueApproval":{"requiredLabels":["x"],"requiredLabels":["y"]}}',
  '{"schemaVersion":1,"reviewMode":"enabled","issueApproval":{"requiredLabels":["x"],"nested":{"same":1,"same":2}}}',
 ];
 for(const source of duplicates)assert.throws(()=>parseRddPolicyText(source),/duplicate object key/i);
 const punctuation=JSON.stringify(object("enabled",['text says "reviewMode": and {"same":1,"same":2}']));
 assert.equal(parseRddPolicyText(punctuation).policy.issueApproval.requiredLabels[0], 'text says "reviewMode": and {"same":1,"same":2}');
});

test("rejects duplicate policy label identities after textual JSON parsing",()=>{
 assert.throws(()=>parseRddPolicyText(text("enabled",["approved","ＡＰＰＲＯＶＥＤ"])),/equivalent|duplicate/i);
});
