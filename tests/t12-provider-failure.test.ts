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
