import assert from "node:assert/strict";
import test from "node:test";
import {isPinnedReferenceDocument,maskApprovedWireSchemas} from "../scripts/upstream-reference-policy.mjs";

const wire="gen"+"tle-ai";
const source="src/review/native-rdd-control.ts";
const fixture="tests/native-rdd-control.test.ts";
const marker=new RegExp("gen"+"tle","i");

test("only explicitly registered non-executable provenance paths are documents",()=>{
 assert.equal(isPinnedReferenceDocument("docs/portable-checkpoint.md"),true);
 assert.equal(isPinnedReferenceDocument("odd/evidence/portable-checkpoint-manifest.json"),true);
 for(const path of ["docs/portable-checkpoint-copy.md","odd/tasks/ui-runtime-delivery-order.md","src/review/native-rdd-control.ts","scripts/upstream-reference-policy.mjs"]){
  assert.equal(isPinnedReferenceDocument(path),false,path);
 }
});
test("only three exact native schema-property strings are masked in the owned implementation and test",()=>{
 for(const path of [source,fixture]){
  for(const identifier of ["review-mode/v1","rdd-mode-status/v1","review-assessment/v1"]){
   const wireValue=wire+"."+identifier;
   for(const separator of [":","==="]){
    const input='const value={schema'+separator+'"'+wireValue+'"};';
    assert.equal(marker.test(maskApprovedWireSchemas(path,input)),false,path);
   }
   for(const input of ['import "'+wireValue+'";','const value="'+wireValue+'";','const value={schema:"'+wireValue+'-next"};']){
    assert.equal(marker.test(maskApprovedWireSchemas(path,input)),true,input);
   }
  }
 }
 assert.equal(marker.test(maskApprovedWireSchemas("src/review/other.ts",'const x={schema:"'+wire+'.review-mode/v1"};')),true);
});
