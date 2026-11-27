import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error — JavaScript helper is exercised directly by the E1 runner.
import {assertReadmeOnlyWriterPlan} from "../scripts/e1-natural-plan-validation.mjs";

test("E1 accepts one Writer limited to README.md",()=>{
 assert.equal(assertReadmeOnlyWriterPlan({roles:[{role:"planner",paths:[]},{role:"worker",paths:["README.md"]}]}),true);
});
test("E1 rejects extra write surfaces",()=>{
 assert.throws(()=>assertReadmeOnlyWriterPlan({roles:[{role:"worker",paths:["README.md","src/index.ts"]}]}),/outside README.md/u);
});
test("E1 requires exactly one Writer targeting README.md",()=>{
 assert.throws(()=>assertReadmeOnlyWriterPlan({roles:[{role:"worker",paths:["src/index.ts"]}]}),/README.md/u);
 assert.throws(()=>assertReadmeOnlyWriterPlan({roles:[{role:"worker",paths:["README.md"]},{role:"worker",paths:["README.md"]}]}),/exactly one/u);
});
