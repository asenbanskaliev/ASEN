import test from "node:test";
import assert from "node:assert/strict";
import {selectAdaptiveReviewLenses} from "../src/review/review-lens-selection.js";
import type {ReviewRiskInput} from "../src/review/review-risk.js";
const input=(severity:"low"|"high",lenses:ReviewRiskInput["lenses"]):ReviewRiskInput=>({
 riskId:"checkpoint",reason:"Review current exact candidate",severity,lenses
});

test("proportional low-risk reviews use only assessed lenses",()=>{
 assert.deepEqual(selectAdaptiveReviewLenses(input("low",["readability"])),{
  lenses:["readability"],requiresIndependentVerification:false,source:"assessed-risk"
 });
 assert.deepEqual(selectAdaptiveReviewLenses(input("low",["risk","reliability"])).lenses,["risk","reliability"]);
});
test("high-risk reviews cannot omit security and reliability, but need not spend all four",()=>{
 assert.deepEqual(selectAdaptiveReviewLenses(input("high",["readability"])).lenses,["risk","reliability","readability"]);
 assert.deepEqual(selectAdaptiveReviewLenses(input("high",["resilience"])).lenses,["risk","reliability","resilience"]);
 assert.deepEqual(selectAdaptiveReviewLenses(input("high",["risk","reliability"])).lenses,["risk","reliability"]);
 assert.equal(selectAdaptiveReviewLenses(input("high",["risk"])).requiresIndependentVerification,true);
});
test("proportional review preserves all valid assessed 4R lanes without duplicates",()=>{
 const chosen=selectAdaptiveReviewLenses(input("high",["readability","risk","resilience","reliability"]));
 assert.equal(chosen.lenses.length,4);assert.equal(new Set(chosen.lenses).size,4);
 assert.deepEqual(chosen.lenses,["risk","reliability","readability","resilience"]);
});
test("malformed and forged assessed data fail before any model use",()=>{
 const good=input("high",["risk"]);
 for(const value of [
  {...good,lenses:["risk","risk"]},
  {...good,lenses:["unknown"]},
  {...good,severity:"critical"},
  {...good,reason:""},
  {...good,lenses:[]}
 ])assert.throws(()=>selectAdaptiveReviewLenses(value as never));
});
