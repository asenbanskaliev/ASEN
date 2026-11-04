import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error JavaScript-only T12 provider error helper.
import {classifyT12ProviderFailure} from "../scripts/t12-provider-failure.mjs";

test("T12 classifies auth, model, quota, timeout and unavailable without leaking credentials",()=>{
 const secret="SYNTHETIC_SECRET_123_NOT_FOR_LOGS";
 const examples=[
  ["401 unauthorized invalid API key","AUTH"],
  ["Unknown model foo:cloud does not exist","MODEL"],
  ["429 rate limit exceeded: free-models-per-day","QUOTA"],
  ["ETIMEDOUT: request timed out","TIMEOUT"],
  ["ECONNREFUSED: provider connection refused","UNAVAILABLE"],
  ["simulated internal transport failure","UNKNOWN"],
 ];
 for(const [message,code] of examples){
  const outcome=classifyT12ProviderFailure(new Error(message+" "+secret));
  assert.equal(outcome.code,code);
  assert.equal(JSON.stringify(outcome).includes(secret),false);
 }
});
test("T12 arbitrary provider input cannot leak unrecognized objects",()=>{
 for(const value of [null,undefined,{token:"SYNTHETIC_SECRET"},["429"],42])
  assert.deepEqual(classifyT12ProviderFailure(value),{
   code:"UNKNOWN",diagnostic:"Provider or agent stage failed without a classified cause",
  });
});

test("T12 F1-C distinguishes negative authentication, quota, billing, model, timeout and service errors",()=>{
 const credential="SYNTHETIC_SECRET_F1C_NEVER_PRINT";
 const cases: Array<readonly [string,string]>=[
  ["HTTP 401: invalid api key","AUTH"],
  ["HTTP 403: permission denied","AUTH"],
  ["HTTP 403 quota_exceeded","QUOTA"],
  ["HTTP 402 Payment Required","BILLING"],
  ["insufficient credits for inference","BILLING"],
  ["insufficient_quota","QUOTA"],
  ["429 Too Many Requests","QUOTA"],
  ["unsupported model beam:unavailable","MODEL"],
  ["invalid_model foo","MODEL"],
  ["HTTP 408 request timeout","TIMEOUT"],
  ["HTTP 504 Gateway Timeout","TIMEOUT"],
  ["ESOCKETTIMEDOUT","TIMEOUT"],
  ["HTTP 502 Bad Gateway","UNAVAILABLE"],
  ["HTTP 529 server overloaded","UNAVAILABLE"],
  ["EHOSTUNREACH","UNAVAILABLE"],
  ["HTTP 404 not found","UNKNOWN"],
 ];
 for(const [message,code] of cases){
  const error=new Error(message+" "+credential);
  const result=classifyT12ProviderFailure(error);
  assert.equal(result.code,code,message);
  assert.equal(Object.keys(result).sort().join(","),"code,diagnostic");
  assert.equal(JSON.stringify(result).includes(credential),false);
  assert.equal(JSON.stringify(result).includes(message),false);
  assert.equal(JSON.stringify(result).includes("api key"),false);
 }
});
test("T12 F1-C cannot leak a huge provider error or accidentally classify arbitrary objects",()=>{
 const secret="SYNTHETIC_SECRET_F1C_BIG";
 const examples=[new Error("unrecognized error "+secret.repeat(10000)),
  new Error("429 "+secret.repeat(10000)),
  new Error(secret.repeat(10000)+" Payment Required"),
  {get message(){throw Error("must not inspect untrusted object getters");}},
 ];
 const codes=["UNKNOWN","QUOTA","BILLING","UNKNOWN"];
 for(const [index,value] of examples.entries()){
  const result=classifyT12ProviderFailure(value);
  assert.equal(result.code,codes[index]);
  assert.equal(JSON.stringify(result).includes(secret),false);
 }
});

test("EF-702 malicious Error accessors, nested causes and proxies cannot read secrets or crash classification",()=>{
 const secret="EF702_SYNTHETIC_NEVER_LEAK";
 let accessed=0;
 const thrown=new Error("ignored");
 Object.defineProperty(thrown,"message",{get(){accessed++;throw Error("SECRET "+secret);}});
 Object.defineProperty(thrown,"name",{get(){accessed++;throw Error("SECRET "+secret);}});
 assert.equal(classifyT12ProviderFailure(thrown).code,"UNKNOWN");
 assert.equal(accessed,0,"Error getters must never be invoked");
 const disguised=new Error("429 rate limit exceeded");
 Object.defineProperty(disguised,"message",{get(){accessed++;return "Payment Required "+secret;}});
 assert.equal(classifyT12ProviderFailure(disguised).code,"UNKNOWN",
  "An accessor cannot override classification with paid/credit claims");
 const proxy=new Proxy(new Error("429 quota exceeded"),{
  getOwnPropertyDescriptor(){throw Error(secret);},
 });
 assert.deepEqual(classifyT12ProviderFailure(proxy),{
  code:"UNKNOWN",diagnostic:"Provider or agent stage failed without a classified cause",
 });
 const caused=new Error("unclassified");
 (caused as Error&{cause:unknown}).cause={get token(){accessed++;throw Error(secret);}};
 const classified=classifyT12ProviderFailure(caused);
 assert.equal(classified.code,"UNKNOWN");
 assert.equal(accessed,0);
 assert.doesNotMatch(JSON.stringify(classified),/EF702_SYNTHETIC_NEVER_LEAK/u);
 assert.equal(classifyT12ProviderFailure(new Error("429 quota exceeded")).code,"QUOTA");
 assert.equal(classifyT12ProviderFailure(new Error("402 Payment Required")).code,"BILLING");
});

test("EF-702 billing must never be mistaken for free quota exhaustion or silently retried",()=>{
 const cases: Array<readonly [string,string]>=[
  ["HTTP 429 rate limit exceeded","QUOTA"],
  ["HTTP 402 Payment Required after 429 retry","BILLING"],
  ["insufficient credits; quota exceeded","BILLING"],
  ["HTTP 403 quota_exceeded","QUOTA"],
  ["HTTP 403 forbidden","AUTH"],
  ["ECONNRESET network failure","UNAVAILABLE"],
  ["ETIMEDOUT after connection refused","TIMEOUT"],
 ];
 for(const [raw,expected] of cases){
  const result=classifyT12ProviderFailure(new Error(raw+" EF702_SECRET_DO_NOT_PERSIST"));
  assert.equal(result.code,expected,raw);
  assert.equal(JSON.stringify(result).includes("EF702_SECRET_DO_NOT_PERSIST"),false);
  assert.equal(JSON.stringify(result).includes(raw),false);
 }
});
test("EF-702 never promotes an untrusted error object to a provider success receipt",()=>{
 for(const value of [{code:"200",status:"success"},Object.create(null),new Proxy({},{
  get(){throw Error("EF702_SECRET");},
 })]){
  const result=classifyT12ProviderFailure(value);
  assert.deepEqual(result,{code:"UNKNOWN",diagnostic:"Provider or agent stage failed without a classified cause"});
 }
});
