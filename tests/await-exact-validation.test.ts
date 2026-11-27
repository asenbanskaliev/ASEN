import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error — módulo JavaScript usado por GitHub Actions.
import {exactValidationState} from "../scripts/await-exact-validation.mjs";
const sha="a".repeat(40),other="b".repeat(40);
const row=(id:number,name:string,status="completed",conclusion:string|null="success",head_sha=sha)=>({id,name,status,conclusion,head_sha,event:"pull_request"});
test("Admite únicamente la última CI y Release Gate del mismo SHA",()=>{
 const green=[row(10,"CI"),row(11,"Release Gate")];
 assert.equal(exactValidationState(green,sha).status,"ready");
 assert.equal(exactValidationState([...green,row(12,"CI","completed","failure")],sha).status,"blocked");
 assert.equal(exactValidationState([...green,row(12,"CI","in_progress",null)],sha).status,"waiting");
 assert.equal(exactValidationState([...green,row(12,"Release Gate","queued",null)],sha).status,"waiting");
 assert.equal(exactValidationState([...green,row(12,"CI","completed","failure",other)],sha).status,"ready");
 assert.equal(exactValidationState([row(10,"CI")],sha).status,"blocked");
});
