import assert from "node:assert/strict";
import test from "node:test";
import {configuredPiProviderCredential,piRuntimeEnvironment} from "../src/agents/pi-process-runner.js";

test("Ollama Cloud agent credential is explicitly selected and isolated",()=>{
 const source={ASEN_AGENT_PROVIDER_CREDENTIAL:"OLLAMA_API_KEY",OLLAMA_API_KEY:"test-only-ollama-token",OPENROUTER_API_KEY:"other-secret",GROQ_API_KEY:"another-secret",HOME:"/tmp/asen-test-home"} as NodeJS.ProcessEnv;
 assert.equal(configuredPiProviderCredential(source),"OLLAMA_API_KEY");
 const child=piRuntimeEnvironment(source,"OLLAMA_API_KEY","linux");
 assert.equal(child.OLLAMA_API_KEY,"test-only-ollama-token");
 assert.equal(child.HOME,"/tmp/asen-test-home");
 assert.equal(child.OPENROUTER_API_KEY,undefined);
 assert.equal(child.GROQ_API_KEY,undefined);
 assert.equal(child.ASEN_AGENT_PROVIDER_CREDENTIAL,undefined);
 assert.equal(child.PI_TELEMETRY,"0");
 const none=piRuntimeEnvironment(source,undefined,"linux");
 assert.equal(none.OLLAMA_API_KEY,undefined,"Unselected credentials must never pass through");
});
test("unknown credential selectors remain fail-closed",()=>{
 assert.throws(()=>configuredPiProviderCredential({ASEN_AGENT_PROVIDER_CREDENTIAL:"UNLISTED_SECRET"}),/supported provider credential/);
 assert.throws(()=>piRuntimeEnvironment({UNLISTED_SECRET:"secret"},"UNLISTED_SECRET" as any),/Unsupported Pi provider credential/);
});
