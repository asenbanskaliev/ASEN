import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error CI-only evidence recorder.
import {admitTapResult} from "../scripts/ecosystem-execution-receipts.mjs";

test("receipt admission requires a completed positive TAP summary with no skips",()=>{
 assert.doesNotThrow(()=>admitTapResult({status:0,signal:null,stdout:'# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n'}));
 for(const result of [
  {status:124,signal:null,stdout:'# pass 2\n'},
  {status:0,signal:null,stdout:'# tests 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n'},
  {status:0,signal:null,stdout:'# tests 2\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 1\n'},
  {status:null,signal:'SIGTERM',stdout:''},
 ])assert.throws(()=>admitTapResult(result));
});
