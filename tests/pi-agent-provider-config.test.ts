import assert from "node:assert/strict";
import test from "node:test";
import {configuredPiProviderCredential} from "../src/agents/pi-process-runner.js";

test("agent provider credential selection requires an explicit allowlisted secret name",()=>{
 assert.equal(configuredPiProviderCredential({}),undefined);
 assert.equal(configuredPiProviderCredential({ASEN_AGENT_PROVIDER_CREDENTIAL:"NVIDIA_API_KEY"}),"NVIDIA_API_KEY");
 assert.equal(configuredPiProviderCredential({ASEN_AGENT_PROVIDER_CREDENTIAL:"OPENROUTER_API_KEY"}),"OPENROUTER_API_KEY");
 assert.equal(configuredPiProviderCredential({ASEN_AGENT_PROVIDER_CREDENTIAL:"GROQ_API_KEY"}),"GROQ_API_KEY");
 assert.equal(configuredPiProviderCredential({ASEN_AGENT_PROVIDER_CREDENTIAL:"LLM7_API_KEY"}),"LLM7_API_KEY");
 assert.throws(()=>configuredPiProviderCredential({ASEN_AGENT_PROVIDER_CREDENTIAL:"AWS_SECRET_ACCESS_KEY"}),/must name one supported provider credential/u);
 assert.throws(()=>configuredPiProviderCredential({ASEN_AGENT_PROVIDER_CREDENTIAL:"sk-secret-value"}),/must name one supported provider credential/u);
});
