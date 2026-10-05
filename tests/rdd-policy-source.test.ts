import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {isRepositoryOperationAuthority} from "../src/repository/operation-policy.js";
import {MAX_RDD_POLICY_BYTES,parseRddPolicyText} from "../src/defects/rdd-policy.js";
import {parseRddPolicyBytes} from "../src/defects/rdd-policy-source.js";

const encoder=new TextEncoder();
const policy=(mode:"enabled"|"disabled"="enabled",labels=["alpha","status:ship"])=>`{"schemaVersion":1,"reviewMode":"${mode}","issueApproval":{"requiredLabels":${JSON.stringify(labels)}}}`;
const identity=(bytes:Uint8Array)=>createHash("sha256").update("asen.rdd-policy.v1\0","utf8").update(bytes).digest("hex");
const parse=(source:string)=>{const bytes=encoder.encode(source);return parseRddPolicyBytes(bytes,identity(bytes));};

test("matches textual parsing for enabled, disabled, Unicode, and exact whitespace bytes",()=>{
 for(const source of [
  policy("enabled",["alpha","status:ship"]),
  policy("disabled",["custom/a","défaut"]),
  `{\n "schemaVersion":1, "reviewMode":"enabled",\n "issueApproval":{"requiredLabels":["alpha","équipe:prête"]}\n}`,
 ])assert.deepEqual(parse(source),parseRddPolicyText(source));
 const escaped='{"schemaVersion":1,"reviewMode":"enabled","issueApproval":{"requiredLabels":["alpha","\\u00e9quipe"]}}';
 assert.deepEqual(parse(escaped),parseRddPolicyText(escaped));
 assert.equal(parse(escaped).policy.issueApproval.requiredLabels[1],"équipe");
});

test("accepts exact cap and Buffer bytes, then rejects oversize before input callbacks",()=>{
 const source=policy();
 const exact=source+" ".repeat(MAX_RDD_POLICY_BYTES-encoder.encode(source).byteLength);
 assert.equal(encoder.encode(exact).byteLength,MAX_RDD_POLICY_BYTES);
 assert.deepEqual(parse(exact),parseRddPolicyText(exact));
 const buffer=Buffer.from(source,"utf8");
 assert.deepEqual(parseRddPolicyBytes(buffer,identity(buffer)),parseRddPolicyText(source));
 let effects=0;const oversize=new Uint8Array(MAX_RDD_POLICY_BYTES+1);
 Object.defineProperty(oversize,"probe",{get(){effects++;throw new Error("must not run");}});
 assert.throws(()=>parseRddPolicyBytes(oversize,"0".repeat(64)),/byte limit/i);
 assert.equal(effects,0);
});

test("rejects malformed, overlong, truncated UTF-8 and a leading BOM without banning valid replacement text",()=>{
 const invalid=[
  Uint8Array.of(0xff),Uint8Array.of(0xc0,0xaf),Uint8Array.of(0xe2,0x82),
  Uint8Array.of(0xef,0xbb,0xbf,...encoder.encode(policy())),
 ];
 for(const bytes of invalid)assert.throws(()=>parseRddPolicyBytes(bytes,identity(bytes)),/UTF-8|BOM/i);
 const legitimate=policy("enabled",["alpha","replacement:�"]);
 assert.equal(parse(legitimate).policy.issueApproval.requiredLabels[1],"replacement:�");
});

test("inherits exact textual schema and duplicate-key rejection",()=>{
 const duplicate='{"schemaVersion":1,"reviewMode":"enabled","review\\u004dode":"disabled","issueApproval":{"requiredLabels":["alpha"]}}';
 const bytes=encoder.encode(duplicate);
 assert.throws(()=>parseRddPolicyBytes(bytes,identity(bytes)),/duplicate object key/i);
});

test("requires the exact lowercase expected original-byte SHA-256 identity",()=>{
 const bytes=encoder.encode(policy());const correct=identity(bytes);
 for(const expected of [undefined,null,"",correct.toUpperCase(),"0".repeat(64),correct.slice(1)] as unknown[])assert.throws(()=>parseRddPolicyBytes(bytes,expected as string),/expected|identity/i);
 assert.equal(parseRddPolicyBytes(bytes,correct).contentIdentity,correct);
});

test("rejects unsafe byte sources and decorations without invoking owned callbacks",()=>{
 let effects=0;
 const getter=encoder.encode(policy());Object.defineProperty(getter,"probe",{get(){effects++;throw new Error("must not run");}});
 const iterator=encoder.encode(policy());Object.defineProperty(iterator,Symbol.iterator,{value(){effects++;throw new Error("must not run");}});
 const proxy=new Proxy(encoder.encode(policy()),{get(){effects++;throw new Error("must not run");},getPrototypeOf(){effects++;throw new Error("must not run");}});
 const numeric:Record<string,unknown>={length:1};Object.defineProperty(numeric,"0",{get(){effects++;throw new Error("must not run");}});
 const sparse=Array(3);Object.defineProperty(sparse,"1",{get(){effects++;throw new Error("must not run");}});
 class DerivedBytes extends Uint8Array{}
 const alteredBuffer=Buffer.from(policy());Object.setPrototypeOf(alteredBuffer,Object.create(Buffer.prototype) as object);
 const unsafe:unknown[]=[getter,iterator,proxy,new DerivedBytes(encoder.encode(policy())),alteredBuffer,new Uint16Array(4),numeric,sparse];
 for(const value of unsafe)assert.throws(()=>parseRddPolicyBytes(value as Uint8Array,"0".repeat(64)),/byte source|undecorated/i);
 if(typeof SharedArrayBuffer!=="undefined")assert.throws(()=>parseRddPolicyBytes(new Uint8Array(new SharedArrayBuffer(8)),"0".repeat(64)),/shared/i);
 const ResizableArrayBuffer=ArrayBuffer as unknown as new(length:number,options:{maxByteLength:number})=>ArrayBuffer;
 const resizable=new ResizableArrayBuffer(8,{maxByteLength:16});
 const isResizable=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,"resizable")?.get?.call(resizable) as boolean|undefined;
 if(isResizable)assert.throws(()=>parseRddPolicyBytes(new Uint8Array(resizable),"0".repeat(64)),/resizable/i);
 const buffer=new ArrayBuffer(8);const detached=new Uint8Array(buffer);structuredClone(buffer,{transfer:[buffer]});
 assert.throws(()=>parseRddPolicyBytes(detached,"0".repeat(64)),/detached/i);
 assert.equal(effects,0);
});

test("returns an exact immutable snapshot independent of later source mutation and grants no authority",()=>{
 const source=policy("enabled",["alpha","status:ship"]);const bytes=encoder.encode(source);
 const parsed=parseRddPolicyBytes(bytes,identity(bytes));bytes.fill(0);
 assert.deepEqual(parsed,parseRddPolicyText(source));
 assert.equal(Object.isFrozen(parsed),true);assert.equal(Object.isFrozen(parsed.policy),true);
 assert.equal(Object.isFrozen(parsed.policy.issueApproval),true);assert.equal(Object.isFrozen(parsed.policy.issueApproval.requiredLabels),true);
 assert.deepEqual(Reflect.ownKeys(parsed),["policy","contentIdentity"]);
 assert.throws(()=>{(parsed.policy.issueApproval.requiredLabels as string[]).push("x");},TypeError);
 assert.equal(isRepositoryOperationAuthority(parsed),false);
 for(const name of ["authority","verdict","approved","ready","delivery","persist","callback"])assert.equal(name in parsed,false);
});
