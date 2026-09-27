import assert from "node:assert/strict";
import test from "node:test";
import { transactionalChange } from "../src/lifecycle/transaction.js";

test("failed verification rolls back", async()=>{
  let state="before";
  const result=await transactionalChange({
    snapshot:async()=>state,
    apply:async()=>{state="after";},
    verify:async()=>false,
    rollback:async(s)=>{state=s;}
  });
  assert.equal(result,"rolled-back");
  assert.equal(state,"before");
});
