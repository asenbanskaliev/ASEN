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
 const cases=[
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
