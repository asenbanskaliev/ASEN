import test from "node:test";
import assert from "node:assert/strict";
import {reconcileParallelWorktreeBatch,type ParallelWorktreeReviewUnit} from "../src/runtime/agents/parallel-worktree-reconciliation.js";
import type {ParallelWorktreeChangeInspection} from "../src/runtime/agents/parallel-worktree-change-inspection.js";

const inspection=(status:ParallelWorktreeChangeInspection["status"],paths:string[]=[]):ParallelWorktreeChangeInspection=>({
 status,changedPaths:paths,outOfScopePaths:status==="out-of-scope"?paths:[],
 headMatchesBase:status!=="head-diverged"&&status!=="unavailable",
 sourceVerified:status!=="unavailable",acceptance:"not-accepted",autoMerge:false
});
const unit=(taskId:string,status:ParallelWorktreeChangeInspection["status"]="scoped-changes",
 paths:string[]=[taskId+".ts"],agentState="completed"):ParallelWorktreeReviewUnit=>({
 taskId,sourceTodoUnchanged:true,changes:inspection(status,paths),
 childSession:{id:taskId+"-pi",agents:[{id:taskId+"-worker",role:"worker",state:agentState}]}
});

test("T06 reconciliation may request manual review but never merges or accepts",()=>{
 const review=reconcileParallelWorktreeBatch({batchState:"prepared",units:[unit("a"),unit("b")]});
 assert.equal(review.disposition,"manual-review-required");
 assert.deepEqual(review.blockers,[]);
 assert.deepEqual(review.evidence.map(x=>x.agentState),["terminal","terminal"]);
 assert.equal(review.acceptance,"not-accepted");assert.equal(review.grantsAuthority,false);assert.equal(review.autoMerge,false);
});
test("T06 unfinished, absent or reserved worktrees cannot be marked ready",()=>{
 const a=reconcileParallelWorktreeBatch({batchState:"prepared",units:[unit("a","clean",[],"running"),unit("b","clean",[],"queued")]});
 assert.equal(a.disposition,"observed-active");assert.equal(a.autoMerge,false);
 const b=reconcileParallelWorktreeBatch({batchState:"reserved",units:[unit("a"),unit("b")]});
 assert.equal(b.disposition,"blocked");assert.match(b.blockers[0]!,/incomplete/u);
});
test("T06 cross-scope conflicts, unreviewed failures and moved HEAD block reconciliation",()=>{
 const samePath=reconcileParallelWorktreeBatch({batchState:"prepared",units:[
  unit("a","scoped-changes",["src/App.ts"]),unit("b","scoped-changes",["src/app.ts"])
 ]});
 assert.equal(samePath.disposition,"blocked");
 assert.ok(samePath.blockers.some(x=>/also modified/u.test(x)));
 const drift=reconcileParallelWorktreeBatch({batchState:"prepared",units:[
  unit("a","head-diverged",["a.ts"]),unit("b","scoped-changes",["b.ts"])
 ]});
 assert.equal(drift.disposition,"blocked");assert.ok(drift.blockers.some(x=>/HEAD drift/u.test(x)));
 const out=reconcileParallelWorktreeBatch({batchState:"prepared",units:[
  unit("a","out-of-scope",["other.txt"]),unit("b","scoped-changes",["b.ts"],"failed")
 ]});
 assert.equal(out.disposition,"blocked");
 assert.ok(out.blockers.some(x=>/outside authorized/u.test(x)));
 assert.ok(out.blockers.some(x=>/terminated unsuccessfully/u.test(x)));
});
test("T06 stale source task and Git observation failure block even successful-looking workers",()=>{
 const stale={...unit("a"),sourceTodoUnchanged:false};
 const absent=unit("b","unavailable",[]);
 const result=reconcileParallelWorktreeBatch({batchState:"prepared",units:[stale,absent]});
 assert.equal(result.disposition,"blocked");
 assert.ok(result.blockers.some(x=>/source ODD Todo changed/u.test(x)));
 assert.ok(result.blockers.some(x=>/Git provenance unavailable/u.test(x)));
});
test("T06 malformed aggregation never produces an acceptance",()=>{
 const source=unit("a"),next=unit("b");
 for(const units of [[source], [source,source],[
  {...source,changes:{...source.changes,acceptance:"accepted"}},next
 ]]){
  assert.throws(()=>reconcileParallelWorktreeBatch({batchState:"prepared",units:units as ParallelWorktreeReviewUnit[]}));
 }
});

test("T06 a completed no-op Worker still requires human review, not fabricated success",()=>{
 const result=reconcileParallelWorktreeBatch({batchState:"prepared",units:[
  unit("a","clean",[],"completed"),unit("b","clean",[],"completed")
 ]});
 assert.equal(result.disposition,"manual-review-required");
 assert.equal(result.acceptance,"not-accepted");assert.equal(result.autoMerge,false);
});
