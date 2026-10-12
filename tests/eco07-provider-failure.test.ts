import assert from "node:assert/strict";
import test from "node:test";
import {eco07ProviderRateLimitError} from "../src/runtime/eco07-provider-failure.js";

test("ECO-07 detects provider quota failures without treating normal Pi replies as failures",()=>{
 const error='429: {"message":"Rate limit exceeded: free-models-per-day","code":429}';
 assert.equal(eco07ProviderRateLimitError({type:"message_end",message:{stopReason:"error",errorMessage:error}}),error);
 assert.equal(eco07ProviderRateLimitError({type:"turn_end",message:{stopReason:"error",errorMessage:"quota_exceeded"}}),"quota_exceeded");
 for(const value of [undefined,null,[],{}, {type:"message_end",message:{stopReason:"stop",errorMessage:error}}, {type:"message_end",message:{stopReason:"error",errorMessage:"invalid request"}}, {type:"message_end",message:{stopReason:"error"}}]){
  assert.equal(eco07ProviderRateLimitError(value),undefined);
 }
 assert.equal(eco07ProviderRateLimitError({message:{stopReason:"error",errorMessage:"x".repeat(1500)+" 429"}})?.length,1200);
});
