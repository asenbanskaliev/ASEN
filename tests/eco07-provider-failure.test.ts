import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";
import {eco07ProviderRateLimitError} from "../src/runtime/eco07-provider-failure.js";
// @ts-expect-error Provider selection is a small Node-side Actions helper.
import {resolveEco07Provider} from "../scripts/eco07-provider-config.mjs";

test("ECO-07 detects provider quota failures without treating normal Pi replies as failures",()=>{
 const error='429: {"message":"Rate limit exceeded: free-models-per-day","code":429}';
 assert.equal(eco07ProviderRateLimitError({type:"message_end",message:{stopReason:"error",errorMessage:error}}),error);
 assert.equal(eco07ProviderRateLimitError({type:"turn_end",message:{stopReason:"error",errorMessage:"quota_exceeded"}}),"quota_exceeded");
 for(const value of [undefined,null,[],{}, {type:"message_end",message:{stopReason:"stop",errorMessage:error}}, {type:"message_end",message:{stopReason:"error",errorMessage:"invalid request"}}, {type:"message_end",message:{stopReason:"error"}}]){
  assert.equal(eco07ProviderRateLimitError(value),undefined);
 }
 assert.equal(eco07ProviderRateLimitError({message:{stopReason:"error",errorMessage:"x".repeat(1500)+" 429"}})?.length,1200);
});

test("ECO-07 selects LLM7 only with its key and the pinned Pi Free extension",()=>{
 const selected=resolveEco07Provider({ASEN_ECO07_PROVIDER:"llm7",ASEN_ECO07_PROVIDER_EXTENSION:"npm:pi-free@2.8.4",LLM7_API_KEY:"synthetic-key"});
 assert.deepEqual({...selected,apiKey:"[hidden]"},{provider:"llm7",model:"default",apiKey:"[hidden]",credential:"LLM7_API_KEY",extension:"npm:pi-free@2.8.4"});
 assert.throws(()=>resolveEco07Provider({ASEN_ECO07_PROVIDER:"llm7",LLM7_API_KEY:"synthetic-key"}),/pinned Pi Free/);
 assert.throws(()=>resolveEco07Provider({ASEN_ECO07_PROVIDER:"llm7",ASEN_ECO07_PROVIDER_EXTENSION:"npm:pi-free@2.8.4"}),/API key is unavailable/);
 assert.throws(()=>resolveEco07Provider({ASEN_ECO07_PROVIDER:"unknown",LLM7_API_KEY:"synthetic-key"}),/Unsupported ECO-07 provider/);
 assert.throws(()=>resolveEco07Provider({ASEN_ECO07_PROVIDER:"llm7",ASEN_ECO07_PROVIDER_EXTENSION:"npm:pi-free@2.8.4",LLM7_API_KEY:"synthetic-key",ASEN_ECO07_MODEL:"bad\nmodel"}),/Invalid ECO-07 model/);
});

test("ECO-07 provider workflow uses Groq without a Pi Free extension or automatic quota-consuming runs",()=>{
 const workflow=readFileSync(resolve(".github/workflows/eco07-groq-recovery.yml"),"utf8");
 assert.match(workflow,/provider: \[groq\]/);
 assert.match(workflow,/GROQ_API_KEY: \\$\{\{ secrets\\.GROQ_API_KEY \\}\}/);
 assert.match(workflow,/ASEN_ECO07_MODEL: openai\\/gpt-oss-120b/);
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/paths: \["\\.github\\/workflows\\/eco07-groq-recovery\\.yml"\]/);
 assert.doesNotMatch(workflow,/pi install npm:pi-free/);
 assert.doesNotMatch(workflow,/ASEN_ECO07_PROVIDER_EXTENSION:/);
 assert.doesNotMatch(workflow,/secrets\\.LLM7_API_KEY/);
});
