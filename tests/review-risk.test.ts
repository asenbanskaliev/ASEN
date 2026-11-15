import test from "node:test";
import assert from "node:assert/strict";
import {planReviewRisk} from "../src/review/review-risk.js";

test("plans only the named review lenses and requires an independent verifier for high risk",()=>{
 const plan=planReviewRisk({riskId:"permissions",reason:"changes private view ACLs",severity:"high",lenses:["risk","reliability"]});
 assert.deepEqual(plan.lenses,["risk","reliability"]);assert.equal(plan.independentVerifier,true);assert.equal(plan.status,"planned");
});

test("low-risk review remains proportional and does not create verification authority",()=>{
 const plan=planReviewRisk({riskId:"docs",reason:"updates command examples",severity:"low",lenses:["readability"]});
 assert.equal(plan.independentVerifier,false);assert.deepEqual(plan.lenses,["readability"]);
});

test("rejects malformed, duplicated, empty, or invented review lenses",()=>{
 for(const value of [
  {riskId:"x",reason:"y",severity:"high",lenses:[]},
  {riskId:"x",reason:"y",severity:"high",lenses:["risk","risk"]},
  {riskId:"x",reason:"y",severity:"high",lenses:["invented"]},
 ])assert.throws(()=>planReviewRisk(value as never));
});
