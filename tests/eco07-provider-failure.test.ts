import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";
import {eco07ProviderRateLimitError} from "../src/runtime/eco07-provider-failure.js";
// @ts-expect-error Provider selection is a small Node-side Actions helper.
import {resolveEco07Provider,validateEco07ProviderSelection} from "../scripts/eco07-provider-config.mjs";

test("ECO-07 detects provider quota failures without treating normal Pi replies as failures",()=>{
 const error='429: {"message":"Rate limit exceeded: free-models-per-day","code":429}';
 assert.equal(eco07ProviderRateLimitError({type:"message_end",message:{stopReason:"error",errorMessage:error}}),error);
 assert.equal(eco07ProviderRateLimitError({type:"turn_end",message:{stopReason:"error",errorMessage:"quota_exceeded"}}),"quota_exceeded");
 for(const value of [undefined,null,[],{}, {type:"message_end",message:{stopReason:"stop",errorMessage:error}}, {type:"message_end",message:{stopReason:"error",errorMessage:"invalid request"}}, {type:"message_end",message:{stopReason:"error"}}]){
  assert.equal(eco07ProviderRateLimitError(value),undefined);
 }
 assert.equal(eco07ProviderRateLimitError({message:{stopReason:"error",errorMessage:"x".repeat(1500)+" 429"}})?.length,1200);
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
 assert.deepEqual(validateEco07ProviderSelection(environment),{provider:"nvidia",model:"deepseek-ai/deepseek-v4.1-flash",credential:"NVIDIA_API_KEY"});
 const selected=resolveEco07Provider({ASEN_ECO07_PROVIDER:"nvidia",NVIDIA_API_KEY:"synthetic-key"});
 assert.deepEqual({...selected,apiKey:"[hidden]"},{provider:"nvidia",model:"deepseek-ai/deepseek-v4.1-flash",apiKey:"[hidden]",credential:"NVIDIA_API_KEY"});
 assert.throws(()=>resolveEco07Provider({ASEN_ECO07_PROVIDER:"nvidia"}),/API key is unavailable/);
 const catalog=JSON.parse(readFileSync(resolve("node_modules/@earendil-works/pi-ai/dist/providers/data/nvidia.json"),"utf8")) as Record<string,Record<string,Record<string,unknown>>>;
 const model=catalog["openai-completions"]?.["chat:deepseek-ai/deepseek-v4.1-flash"];
 assert.equal(model?.id,"deepseek-ai/deepseek-v4.1-flash");
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

test("ECO-07 exact-SHA workflow selects one provider secret and supports a guarded branch run",()=>{
 const workflow=readFileSync(resolve(".github/workflows/eco07-groq-e2e.yml"),"utf8");
 const compact=workflow.replace(/\s+/gu," ");
 assert.ok(workflow.includes("workflow_dispatch:"));
 assert.ok(workflow.includes("[ECO07-NVIDIA]"));
 assert.ok(compact.includes("push: branches: - feat/strict-parity-prerequisites paths: - .github/workflows/eco07-groq-e2e.yml - scripts/eco07-pi-recovery-e2e.mjs - scripts/eco07-pi-recovery-probe-extension.mjs - src/runtime/todo-store.ts"));
 assert.ok(workflow.includes("default: nvidia"));
 assert.ok(workflow.includes("- nvidia"));
 assert.ok(workflow.includes("- groq"));
 assert.ok(workflow.includes("expected_sha:"));
 assert.ok(workflow.includes('NVIDIA_API_KEY: ${{ secrets.NVIDIA_API_KEY }}'));
 assert.ok(workflow.includes("ASEN_ECO07_PROVIDER: nvidia"));
 assert.ok(workflow.includes("ASEN_ECO07_MODEL: deepseek-ai/deepseek-v4.1-flash"));
 assert.ok(workflow.includes('GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}'));
 const nvidiaStep=workflow.split("- name: Execute real Pi NVIDIA interruption and restart")[1]?.split("- name: Execute real Pi Groq interruption and restart")[0]??"";
 const groqStep=workflow.split("- name: Execute real Pi Groq interruption and restart")[1]?.split("- name: Preserve process and event evidence")[0]??"";
 assert.ok(nvidiaStep.includes("secrets.NVIDIA_API_KEY"));
 assert.ok(!nvidiaStep.includes("secrets.GROQ_API_KEY"));
 assert.ok(groqStep.includes("secrets.GROQ_API_KEY"));
 assert.ok(!groqStep.includes("secrets.NVIDIA_API_KEY"));
 assert.ok(compact.includes("if: github.event_name == 'push' || inputs.provider == 'nvidia'"));
 assert.ok(compact.includes("if: github.event_name == 'workflow_dispatch' && inputs.provider == 'groq'"));
 assert.ok(compact.includes("github.event_name == 'push' && contains(github.event.head_commit.message, '[ECO07-NVIDIA]')"));
 assert.ok(compact.includes("ASEN_EXPECTED_SHA: ${{ inputs.expected_sha || github.sha }}"));
 assert.ok(compact.includes("test \"$ASEN_EXPECTED_SHA\" = \"$GITHUB_EVENT_SHA\""));
 assert.ok(compact.includes("git ls-remote origin"));
 assert.ok(workflow.includes("actions/upload-artifact@v6"));
 assert.ok(workflow.includes("${{ inputs.provider || 'nvidia' }}-recovery-${{ inputs.expected_sha || github.sha }}-${{ inputs.os || 'ubuntu-24.04' }}"));
 assert.ok(!compact.includes("pull_request:"));
});
