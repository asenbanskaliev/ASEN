import assert from "node:assert/strict";
import test from "node:test";
import {
 DEFAULT_FAST_MODE_CONFIG,
 applyServiceTier,
 isFastModeEligible,
 isServiceTier,
 resolveServiceTier,
 type FastModeConfig,
 type ServiceTier,
} from "../src/runtime/fast-mode-policy.js";

const FAST_MODELS = ["gpt-5.6-luna","gpt-5.6-sol","gpt-5.6-terra","gpt-6-astra","gpt-6-sol","gpt-6-luna","gpt-6.1-sol","gpt-6.1-terra"];

test("isServiceTier accepts only the closed tier vocabulary", () => {
 for (const value of ["standard", "fast"]) assert.equal(isServiceTier(value), true);
 for (const value of ["FAST", "priority", "default", "", "undefined", undefined, null, 1, {}, ["fast"]]) {
  assert.equal(isServiceTier(value), false);
 }
});

test("the default config mirrors the v4.8.0 fast-model catalog", () => {
 assert.deepEqual([...DEFAULT_FAST_MODE_CONFIG.fastModels].sort(), [...FAST_MODELS].sort());
 assert.equal(DEFAULT_FAST_MODE_CONFIG.defaultTier, "standard");
 assert.equal(Object.isFrozen(DEFAULT_FAST_MODE_CONFIG), true);
 assert.equal(Object.isFrozen(DEFAULT_FAST_MODE_CONFIG.fastModels), true);
 assert.throws(()=>{(DEFAULT_FAST_MODE_CONFIG.fastModels as Set<string>).add("gpt-9");}, TypeError);
});

test("resolveServiceTier maps the tier to its wire value only for eligible models", () => {
 assert.equal(resolveServiceTier("gpt-6-sol", "fast"), "priority");
 assert.equal(resolveServiceTier("gpt-6-sol", "standard"), "default");
 assert.equal(resolveServiceTier("gpt-5.6-luna", "fast"), "priority");
 assert.equal(resolveServiceTier("gpt-9-unknown", "fast"), undefined);
 assert.equal(resolveServiceTier("gpt-9-unknown", "standard"), undefined);
 assert.equal(resolveServiceTier("gpt-6-sol", undefined), undefined);
});

test("isFastModeEligible is a membership check over the configured set", () => {
 for (const model of FAST_MODELS) assert.equal(isFastModeEligible(model), true);
 for (const model of ["gpt-9-unknown", "", "GPT-6-SOL", "gpt-6-sol "]) assert.equal(isFastModeEligible(model), false);
});

test("applyServiceTier adds service_tier to a copy of the payload", () => {
 const payload = {model: "gpt-6.1-terra", messages: [{role: "user"}]};
 const before = structuredClone(payload);
 const result = applyServiceTier(payload, "fast", "gpt-6.1-terra")!;
 assert.equal(result.service_tier, "priority");
 assert.equal(result.model, "gpt-6.1-terra");
 assert.notEqual(result, payload);
 assert.deepEqual(payload, before);
 assert.equal("service_tier" in payload, false);
 assert.equal(applyServiceTier(payload, "standard", "gpt-6.1-terra")!.service_tier, "default");
});

test("applyServiceTier declines requests that carry no fast-mode override", () => {
 const payload = {model: "gpt-6-sol"};
 assert.equal(applyServiceTier(payload, undefined, "gpt-6-sol"), undefined);
 assert.equal(applyServiceTier(payload, "fast", "gpt-9-unknown"), undefined);
 assert.equal(applyServiceTier(undefined, "fast", "gpt-6-sol"), undefined);
 assert.equal(applyServiceTier([] as unknown as Record<string, unknown>, "fast", "gpt-6-sol"), undefined);
 assert.equal(applyServiceTier("gpt-6-sol" as unknown as Record<string, unknown>, "fast", "gpt-6-sol"), undefined);
});

test("a supplied config overrides the default eligibility set", () => {
 const custom: FastModeConfig = {fastModels: new Set(["custom-model"]), defaultTier: "standard"};
 assert.equal(isFastModeEligible("custom-model", custom), true);
 assert.equal(isFastModeEligible("gpt-6-sol", custom), false);
 assert.equal(resolveServiceTier("custom-model", "fast", custom), "priority");
 assert.equal(resolveServiceTier("gpt-6-sol", "fast", custom), undefined);
 assert.equal(applyServiceTier({model: "gpt-6-sol"}, "fast", "gpt-6-sol", custom), undefined);
 assert.equal(applyServiceTier({model: "custom-model"}, "standard", "custom-model", custom)!.service_tier, "default");
});

test("malformed configs are refused rather than silently ignored", () => {
 const badTier: FastModeConfig = {fastModels: new Set(["custom-model"]), defaultTier: "priority" as ServiceTier};
 const badModels: FastModeConfig = {fastModels: undefined as unknown as ReadonlySet<string>, defaultTier: "standard"};
 assert.throws(()=>isFastModeEligible("custom-model", badTier), TypeError);
 assert.throws(()=>resolveServiceTier("custom-model", "fast", badModels), TypeError);
 assert.throws(()=>applyServiceTier({model: "custom-model"}, "fast", "custom-model", badModels), TypeError);
});
