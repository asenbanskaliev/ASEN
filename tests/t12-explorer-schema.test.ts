import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error JavaScript-only schema helper.
import {inspectExplorerSchema} from "../scripts/t12-explorer-schema.mjs";

const response=()=>({
 currentState:"Read-only fixture with three deliberate defects",
 affectedAreas:["src/pricing.js","src/access.js","src/parse.js"],
 approaches:["Correct the defects within the declared file set"],
 evidence:["The discount is added instead of subtracted"],
 risks:["An incorrect change would alter behavior"],
 unknowns:[],
 readiness:"Ready for read-only planning",
 findings:[{id:"pricing",path:"src/pricing.js",reason:"The discount is added instead of reducing the total"}],
});

test("T12 Explorer requires all eight JSON fields of their exact types",()=>{
 assert.equal(inspectExplorerSchema(response()).passed,true);
 for(const field of ["currentState","affectedAreas","approaches","evidence","risks","unknowns","readiness","findings"]){
  const candidate=response() as Record<string,unknown>;
  delete candidate[field];
  assert.equal(inspectExplorerSchema(candidate).passed,false,"Missing field "+field);
 }
 for(const field of ["affectedAreas","approaches","evidence","risks","unknowns","findings"]){
  const candidate=response() as Record<string,unknown>;
  candidate[field]=null;
  assert.equal(inspectExplorerSchema(candidate).passed,false,"Invalid array "+field);
 }
});
test("T12 Explorer schema diagnostics show only types, not model content or secrets",()=>{
 const secret="SYNTHETIC_EXPLORER_SECRET";
 const candidate={...response(),currentState:secret,readiness:[],findings:"not an array"};
 const observed=inspectExplorerSchema(candidate);
 assert.equal(observed.passed,false);
 assert.deepEqual(observed.observedShape,{
  currentState:"string",affectedAreas:"array",approaches:"array",
  evidence:"array",risks:"array",unknowns:"array",readiness:"array",findings:"string",
 });
 assert.equal(JSON.stringify(observed).includes(secret),false);
});
