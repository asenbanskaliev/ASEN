import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";
import {eco07ProviderRateLimitError} from "../src/runtime/eco07-provider-failure.js";
// @ts-expect-error Provider selection is a small Node-side Actions helper.
import {resolveEco07Provider,validateEco07ProviderSelection} from "../scripts/eco07-provider-config.mjs";

test("ECO-07 detects provider quota failures without treating normal Pi replies as failures",()=>{
 const error='429: {"message":"Rate limit exceeded: free-models-per-day","code":429}';
 assert.equal(eco07ProviderRateLimitError({type:"message_end",message:{stopReason:"error",errorMessage:error}}),"Provider rate limit (HTTP 429)");
 assert.equal(eco07ProviderRateLimitError({type:"turn_end",message:{stopReason:"error",errorMessage:"quota_exceeded"}}),"Provider quota exhausted");
 for(const value of [undefined,null,[],{}, {type:"message_end",message:{stopReason:"stop",errorMessage:error}}, {type:"message_end",message:{stopReason:"error",errorMessage:"invalid request"}}, {type:"message_end",message:{stopReason:"error"}}]){
  assert.equal(eco07ProviderRateLimitError(value),undefined);
 }
 assert.equal(eco07ProviderRateLimitError({message:{stopReason:"error",errorMessage:"x".repeat(1500)+" 429"}}),"Provider rate limit (HTTP 429)");
});

test("ECO-07 provider error receipts never echo token, URL, prompt or untrusted control characters",()=>{
 const secret="SYNTHETIC_SECRET_DO_NOT_LOG";
 const attempts=[
  `HTTP 429 Bearer ${secret} https://host.invalid/?api_key=${secret}`,
  `quota_exceeded Authorization: Bearer ${secret}`,
  `rate limit: ${secret}\\u202e\\u001b[31m prompt: ${secret}`,
  `Too Many Requests, token=${secret}`,
 ];
 for(const errorMessage of attempts){
  const result=eco07ProviderRateLimitError({type:"message_end",message:{stopReason:"error",errorMessage}});
  assert.ok(result);
  assert.ok(result.startsWith("Provider "));
  assert.doesNotMatch(result,/SYNTHETIC_SECRET_DO_NOT_LOG|Bearer|host\\.invalid|\\x1b|\\u202e|prompt:/u);
  assert.ok(result.length<64);
 }
 assert.equal(eco07ProviderRateLimitError({type:"message_end",message:{stopReason:"error",errorMessage:"invalid token: "+secret}}),undefined);
 assert.equal(eco07ProviderRateLimitError({message:{stopReason:"error",errorMessage:`quota exhausted and HTTP 429 ${secret}`}}),"Provider rate limit (HTTP 429)");
 for(const malformed of [[],null,{},42,"quota_exceeded",{stopReason:"error",errorMessage:"429"},{message:[]},{message:{stopReason:"stop",errorMessage:"429"}},{message:{stopReason:"error",errorMessage:{message:"quota_exceeded"}}}]){
  assert.equal(eco07ProviderRateLimitError(malformed),undefined);
 }
});

test("ECO-07 validates provider metadata without reading a credential",()=>{
 const environment=new Proxy({ASEN_ECO07_PROVIDER:"openrouter",ASEN_ECO07_MODEL:"nvidia/nemotron-3.5-lightning:free"},{
  get(target,key,receiver){if(String(key).endsWith("_API_KEY"))throw new Error("credential read");return Reflect.get(target,key,receiver);},
 });
 assert.deepEqual(validateEco07ProviderSelection(environment),{provider:"openrouter",model:"nvidia/nemotron-3.5-lightning:free",credential:"OPENROUTER_API_KEY"});
});

test("ECO-07 selects Pi-native NVIDIA NIM without reading its credential during validation",()=>{
 const environment=new Proxy({ASEN_ECO07_PROVIDER:"nvidia"},{
  get(target,key,receiver){if(String(key).endsWith("_API_KEY"))throw new Error("credential read");return Reflect.get(target,key,receiver);},
 });
 assert.deepEqual(validateEco07ProviderSelection(environment),{provider:"nvidia",model:"nvidia/nemotron-3.5-lightning-30b-a3b",credential:"NVIDIA_API_KEY"});
 const selected=resolveEco07Provider({ASEN_ECO07_PROVIDER:"nvidia",NVIDIA_API_KEY:"synthetic-key"});
 assert.deepEqual({...selected,apiKey:"[hidden]"},{provider:"nvidia",model:"nvidia/nemotron-3.5-lightning-30b-a3b",apiKey:"[hidden]",credential:"NVIDIA_API_KEY"});
 assert.throws(()=>resolveEco07Provider({ASEN_ECO07_PROVIDER:"nvidia"}),/API key is unavailable/);
 const catalog=JSON.parse(readFileSync(resolve("node_modules/@earendil-works/pi-ai/dist/providers/data/nvidia.json"),"utf8")) as Record<string,Record<string,Record<string,unknown>>>;
 const model=catalog["openai-completions"]?.["chat:nvidia/nemotron-3.5-lightning-30b-a3b"];
 assert.equal(model?.id,"nvidia/nemotron-3.5-lightning-30b-a3b");
 assert.equal(model?.provider,"nvidia");
 assert.equal(model?.baseUrl,"https://integrate.api.nvidia.com/v1");
});

test("ECO-07 selects LLM7 only with its key and the pinned Pi Free extension",()=>{
 const selected=resolveEco07Provider({ASEN_ECO07_PROVIDER:"llm7",ASEN_ECO07_PROVIDER_EXTENSION:"npm:pi-free@2.8.4",LLM7_API_KEY:"synthetic-key"});
 assert.deepEqual({...selected,apiKey:"[hidden]"},{provider:"llm7",model:"default",apiKey:"[hidden]",credential:"LLM7_API_KEY",extension:"npm:pi-free@2.8.4"});
 assert.throws(()=>resolveEco07Provider({ASEN_ECO07_PROVIDER:"llm7",LLM7_API_KEY:"synthetic-key"}),/pinned Pi Free/);
 assert.throws(()=>resolveEco07Provider({ASEN_ECO07_PROVIDER:"llm7",ASEN_ECO07_PROVIDER_EXTENSION:"npm:pi-free@2.8.4"}),/API key is unavailable/);
 assert.throws(()=>resolveEco07Provider({ASEN_ECO07_PROVIDER:"unknown",LLM7_API_KEY:"synthetic-key"}),/Unsupported ECO-07 provider/);
 assert.throws(()=>resolveEco07Provider({ASEN_ECO07_PROVIDER:"llm7",ASEN_ECO07_PROVIDER_EXTENSION:"npm:pi-free@2.8.4",LLM7_API_KEY:"synthetic-key",ASEN_ECO07_MODEL:"bad\nmodel"}),/Invalid ECO-07 model/);
});

test("ECO-07 provider workflow uses OpenRouter only after manual exact-SHA dispatch",()=>{
 const workflow=readFileSync(resolve(".github/workflows/eco07-groq-recovery.yml"),"utf8");
 const compact=workflow.replace(/\s+/gu," ");
 assert.ok(workflow.includes("type: choice"));
 for(const operatingSystem of ["ubuntu-24.04","macos-15","windows-2025"])assert.ok(workflow.includes(`- ${operatingSystem}`));
 assert.ok(workflow.includes("expected_sha:"));
 assert.ok(workflow.includes('OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}'));
 assert.ok(workflow.includes("ASEN_ECO07_MODEL: nvidia/nemotron-3.5-lightning:free"));
 assert.ok(workflow.includes("workflow_dispatch:"));
 assert.ok(!compact.includes("pull_request:"));
 assert.ok(!compact.includes("push:"));
 assert.ok(compact.includes("github.event_name == 'workflow_dispatch'"));
 assert.ok(workflow.includes("github.run_attempt == 1"));
 assert.ok(!workflow.includes("matrix:"));
 assert.ok(!workflow.includes("pi install npm:pi-free"));
 assert.ok(!workflow.includes("ASEN_ECO07_PROVIDER_EXTENSION:"));
 assert.ok(!workflow.includes("secrets.LLM7_API_KEY"));
});

test("ECO-07 exact-SHA workflow uses NVIDIA only and supports a guarded branch run",()=>{
 const workflow=readFileSync(resolve(".github/workflows/eco07-nvidia-e2e.yml"),"utf8");
 const compact=workflow.replace(/\s+/gu," ");
 assert.ok(workflow.includes("workflow_dispatch:"));
 assert.ok(compact.includes("push: branches: - feat/strict-parity-prerequisites paths: - .github/workflows/eco07-nvidia-e2e.yml - scripts/eco07-pi-recovery-e2e.mjs - scripts/eco07-pi-recovery-probe-extension.mjs - src/runtime/todo-store.ts - src/runtime/plan-dispatcher.ts - src/agents/pi-agent-tools.ts - src/agents/dispatcher.ts - src/agents/pi-process-runner.ts - src/lifecycle/skill-lifecycle.ts"));
 assert.ok(workflow.includes("expected_sha:"));
 assert.ok(workflow.includes('NVIDIA_API_KEY: ${{ secrets.NVIDIA_API_KEY }}'));
 assert.ok(workflow.includes("ASEN_ECO07_PROVIDER: nvidia"));
 assert.ok(workflow.includes("ASEN_ECO07_MODEL: nvidia/nemotron-3.5-lightning-30b-a3b"));
 assert.ok(!workflow.includes("GROQ_API_KEY"));
 const nvidiaStep=workflow.split("- name: Execute real Pi NVIDIA interruption and restart")[1]?.split("- name: Preserve process and event evidence")[0]??"";
 assert.ok(nvidiaStep.includes("secrets.NVIDIA_API_KEY"));
 assert.ok(!compact.includes("inputs.provider"));
 assert.ok(compact.includes("github.ref == 'refs/heads/feat/strict-parity-prerequisites' && (github.event_name == 'workflow_dispatch' || github.event_name == 'push')"));
 assert.ok(!compact.includes("contains(github.event.head_commit.message"));
 assert.ok(compact.includes("ASEN_EXPECTED_SHA: ${{ inputs.expected_sha || github.sha }}"));
 assert.ok(compact.includes("test \"$ASEN_EXPECTED_SHA\" = \"$GITHUB_EVENT_SHA\""));
 assert.ok(compact.includes("git ls-remote origin"));
 assert.ok(workflow.includes("actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f # v6.4.3"));
 assert.ok(workflow.includes("eco07-nvidia-recovery-${{ inputs.expected_sha || github.sha }}-${{ inputs.os || 'ubuntu-24.04' }}"));
 assert.ok(!compact.includes("pull_request:"));
});

test("EF-702 only terminal Pi failure envelopes may classify provider quota, and large errors are rejected",()=>{
 const errorMessage="HTTP 429: https://provider.invalid?token=SYNTHETIC_SECRET";
 for(const type of ["tool_execution_start","tool_execution_end","message_start","message_update","message_delta","assistant_delta","unknown",null,429]){
  assert.equal(eco07ProviderRateLimitError({type,message:{stopReason:"error",errorMessage}}),undefined,String(type));
 }
 assert.equal(eco07ProviderRateLimitError({type:"message_end",message:{stopReason:"error",errorMessage}}),
  "Provider rate limit (HTTP 429)");
 assert.equal(eco07ProviderRateLimitError({type:"turn_end",message:{stopReason:"error",errorMessage:"quota_exceeded"}}),
  "Provider quota exhausted");
 assert.equal(eco07ProviderRateLimitError({type:"message_end",message:{stopReason:"error",errorMessage:"x".repeat(64*1024)+" 429"}}),undefined);
 assert.equal(eco07ProviderRateLimitError({type:"message_end",message:{stopReason:"stop",errorMessage}}),undefined);
});


test("EF-702 terminal-only quota classification never invokes malicious accessors",()=>{
 const secret="EF702_PRIVATE_EXAMPLE";
 let calls=0;
 const getter=()=>{calls++;throw Error(secret);};
 const attack=new Object();
 Object.defineProperty(attack,"type",{get:getter});
 Object.defineProperty(attack,"message",{get:getter});
 assert.equal(eco07ProviderRateLimitError(attack),undefined);
 const maliciousMessage={stopReason:"error"};
 Object.defineProperty(maliciousMessage,"errorMessage",{get:getter});
 assert.equal(eco07ProviderRateLimitError({type:"message_end",message:maliciousMessage}),undefined);
 const inherited=Object.create({errorMessage:"429 quota exceeded",stopReason:"error"});
 assert.equal(eco07ProviderRateLimitError({type:"message_end",message:inherited}),undefined);
 const proxy=new Proxy({type:"message_end",message:{stopReason:"error",errorMessage:"429"}},{
  getOwnPropertyDescriptor(){throw Error(secret);}
 });
 assert.equal(eco07ProviderRateLimitError(proxy),undefined);
 const revoked=Proxy.revocable({type:"message_end"},{});revoked.revoke();
 assert.equal(eco07ProviderRateLimitError(revoked.proxy),undefined);
 assert.equal(calls,0,"Classifier must not execute input getters");
 assert.equal(eco07ProviderRateLimitError({type:"message_update",message:{stopReason:"error",errorMessage:"429"}}),undefined);
 assert.equal(eco07ProviderRateLimitError({message:{stopReason:"error",errorMessage:"429"}}),"Provider rate limit (HTTP 429)","Explicit legacy terminal envelope retained");
});

test("EF-702 quota-only diagnostics refuse billing claims even when a retry mentions 429",()=>{
 const message={stopReason:"error",errorMessage:"HTTP 402 Payment Required after 429 retry"};
 assert.equal(eco07ProviderRateLimitError({type:"message_end",message}),undefined);
 assert.equal(eco07ProviderRateLimitError({type:"turn_end",message:{stopReason:"error",errorMessage:"insufficient credits and quota exceeded"}}),undefined);
 assert.equal(eco07ProviderRateLimitError({type:"message_end",message:{stopReason:"error",errorMessage:"HTTP 429 quota exceeded"}}),"Provider rate limit (HTTP 429)");
});
