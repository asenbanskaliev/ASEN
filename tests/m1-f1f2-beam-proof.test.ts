import test from "node:test";
import assert from "node:assert/strict";
import {parseM1ModelAnswer} from "../scripts/m1-f1f2-beam-proof.mjs";
const direct='{"scenario":"F1_DIRECT","route":"direct","delegated":false}';
const fallback='{"scenario":"F2_CODEGRAPH_UNAVAILABLE","firstTool":"codegraph","fallback":"read/grep","indexMutation":false}';
test("M1/F1/F2 Beam parser permits only bounded factual decisions",()=>{
 assert.equal(parseM1ModelAnswer(direct,"F1_DIRECT").route,"direct");
 assert.equal(parseM1ModelAnswer(fallback,"F2_CODEGRAPH_UNAVAILABLE").indexMutation,false);
 for(const [s,raw] of [
  ["F1_DIRECT",'{"scenario":"F1_DIRECT","route":"orchestrate","delegated":true}'],
  ["F1_DIRECT",'{"scenario":"F1_DIRECT","route":"direct","delegated":false,"writerApproved":true}'],
  ["F2_CODEGRAPH_UNAVAILABLE",'{"scenario":"F2_CODEGRAPH_UNAVAILABLE","firstTool":"read","fallback":"read/grep","indexMutation":false}'],
  ["F2_CODEGRAPH_UNAVAILABLE",'{"scenario":"F2_CODEGRAPH_UNAVAILABLE","firstTool":"codegraph","fallback":"read/grep","indexMutation":true}']
 ] as const)assert.throws(()=>parseM1ModelAnswer(raw,s));
});
