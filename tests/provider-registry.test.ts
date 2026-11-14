import assert from "node:assert/strict";
import test from "node:test";
import {createProviderRegistry, type ProviderConfig, type ProviderModel} from "../src/runtime/provider-registry.js";

const GLM: ProviderModel = {
 id: "glm5.3",
 name: "GLM 5.3",
 contextWindow: 200_000,
 maxTokens: 32_000,
 reasoning: true,
 thinkingLevelMap: {off: null, xhigh: "xhigh", max: "max"},
 input: ["text", "image"],
 compat: {maxTokensField: "max_completion_tokens"},
};
const QWEN: ProviderModel = {id: "qwen3.8-flash", name: "Qwen 3.8 Flash", contextWindow: 128_000, maxTokens: 8_192};

function nanConfig(models: readonly ProviderModel[] = [GLM]): ProviderConfig {
 return {
  id: "nan",
  name: "NaN Builders",
  baseUrl: "https://api.nan.builders/v1",
  api: "openai-completions",
  auth: {type: "api_key", name: "NAN_API_KEY"},
  models,
 };
}
function otherConfig(): ProviderConfig {
 return {...nanConfig([QWEN]), id: "second", name: "Second Provider", baseUrl: "https://second.example/v1"};
}

test("registers a provider and returns its frozen configuration", () => {
 const registry = createProviderRegistry();
 registry.register(nanConfig());
 assert.equal(registry.has("nan"), true);
 const stored = registry.get("nan");
 assert.ok(stored);
 assert.equal(stored.name, "NaN Builders");
 assert.equal(stored.baseUrl, "https://api.nan.builders/v1");
 assert.equal(stored.api, "openai-completions");
 assert.deepEqual(stored.auth, {type: "api_key", name: "NAN_API_KEY"});
 assert.deepEqual(stored.models.map(model=>model.id), ["glm5.3"]);
 assert.throws(()=>{(stored as {name:string}).name="mutated";}, TypeError);
});

test("has and unregister report registry membership truthfully", () => {
 const registry = createProviderRegistry();
 assert.equal(registry.has("nan"), false);
 assert.equal(registry.get("nan"), undefined);
 assert.equal(registry.unregister("nan"), false);
 registry.register(nanConfig());
 assert.equal(registry.has("nan"), true);
 assert.equal(registry.unregister("nan"), true);
 assert.equal(registry.has("nan"), false);
 assert.equal(registry.get("nan"), undefined);
 assert.deepEqual(registry.list(), []);
});

test("lists providers in registration order", () => {
 const registry = createProviderRegistry();
 registry.register(nanConfig());
 registry.register(otherConfig());
 const listed = registry.list();
 assert.deepEqual(listed.map(config=>config.id), ["nan","second"]);
 assert.equal(Object.isFrozen(listed), true);
 assert.equal(listed.every(config=>Object.isFrozen(config)), true);
});

test("findModel joins the catalog entry with its provider identity", () => {
 const registry = createProviderRegistry();
 registry.register(nanConfig([GLM, QWEN]));
 const found = registry.findModel("nan", "glm5.3");
 assert.ok(found);
 assert.equal(found.id, "glm5.3");
 assert.equal(found.providerId, "nan");
 assert.equal(found.baseUrl, "https://api.nan.builders/v1");
 assert.equal(found.reasoning, true);
 assert.deepEqual(found.thinkingLevelMap, {off: null, xhigh: "xhigh", max: "max"});
 assert.deepEqual(found.input, ["text", "image"]);
 assert.deepEqual(found.compat, {maxTokensField: "max_completion_tokens"});
 assert.throws(()=>{(found as {contextWindow:number}).contextWindow=1;}, TypeError);
 assert.equal(registry.findModel("nan", "unknown-model"), undefined);
 assert.equal(registry.findModel("missing", "glm5.3"), undefined);
});

test("duplicate registration replaces the previous catalog last-writer-wins", () => {
 const registry = createProviderRegistry();
 registry.register(nanConfig());
 registry.register(otherConfig());
 registry.register(nanConfig([QWEN]));
 assert.deepEqual(registry.list().map(config=>config.id), ["nan","second"]);
 assert.equal(registry.findModel("nan", "glm5.3"), undefined);
 assert.equal(registry.findModel("nan", "qwen3.8-flash")?.name, "Qwen 3.8 Flash");
});

test("rejects configurations that cannot form a usable provider", () => {
 const registry = createProviderRegistry();
 const broken: ProviderConfig[] = [{...nanConfig(), id: ""}, {...nanConfig(), baseUrl: ""}, nanConfig([])];
 for (const config of broken) assert.throws(()=>registry.register(config), TypeError);
 assert.throws(()=>registry.register({...nanConfig(), models: [{...GLM, id: ""}]}), TypeError);
 assert.throws(()=>registry.register({...nanConfig(), models: [{...GLM, contextWindow: 0}]}), TypeError);
 assert.throws(()=>registry.register({...nanConfig(), auth: {type: "password" as "api_key"}}), TypeError);
 assert.deepEqual(registry.list(), []);
});

test("registration deep-copies caller-owned nested catalog data", () => {
 const registry = createProviderRegistry();
 const thinking: Record<string,string|null> = {off: null};
 const input: ("text"|"image")[] = ["text"];
 registry.register({...nanConfig([{...GLM, thinkingLevelMap: thinking, input}])});
 thinking.max = "max";
 input.push("image");
 const stored = registry.get("nan")!.models[0]!;
 assert.deepEqual(Object.keys(stored.thinkingLevelMap!), ["off"]);
 assert.deepEqual(stored.input, ["text"]);
 assert.equal(Object.isFrozen(stored.thinkingLevelMap), true);
});

test("getAllModels exposes provider and model pairs in registration order", () => {
 const registry = createProviderRegistry();
 registry.register(nanConfig([GLM, QWEN]));
 registry.register(otherConfig());
 const pairs = registry.getAllModels();
 assert.deepEqual(pairs.map(pair=>[pair.provider.id, pair.model.id]), [
  ["nan","glm5.3"],
  ["nan","qwen3.8-flash"],
  ["second","qwen3.8-flash"],
 ]);
 assert.equal(Object.isFrozen(pairs), true);
 assert.equal(pairs.every(pair=>Object.isFrozen(pair)), true);
 assert.equal(pairs[0]!.provider.models.length, 2);
 assert.equal(registry.unregister("nan"), true);
 assert.deepEqual(registry.getAllModels().map(pair=>pair.provider.id), ["second"]);
});
