import test from "node:test";
import assert from "node:assert/strict";
import {ExplorerBudgetTelemetry,EXPLORER_OUTPUT_LIMIT_BYTES} from "../src/runtime/explorer-budget.js";
const observation=(id:string,name="read",text="one")=>({toolCallId:id,toolName:name,result:{content:[{type:"text",text}]}});
test("EF-202 three focused queries stay within budget",()=>{
 const tracker=new ExplorerBudgetTelemetry();
 assert.equal(tracker.observe(observation("1","codegraph")),false);
 assert.equal(tracker.observe(observation("2")),false);
 assert.equal(tracker.observe(observation("3")),false);
 assert.equal(tracker.snapshot().queries,3);
 assert.equal(tracker.snapshot().firstTool,"codegraph");
 assert.equal(tracker.snapshot().overBudget,false);
});
test("EF-202 fourth read query suggests Explorer only once",()=>{
 const tracker=new ExplorerBudgetTelemetry();
 for(let n=0;n<3;n++)assert.equal(tracker.observe(observation(String(n))),false);
 assert.equal(tracker.observe(observation("3")),true);
 assert.equal(tracker.observe(observation("4")),false);
 assert.equal(tracker.snapshot().queries,4);
 assert.equal(tracker.snapshot().recommendationIssued,true);
});
test("EF-202 more than 40 KiB of observed UTF-8 output triggers once",()=>{
 const tracker=new ExplorerBudgetTelemetry();
 assert.equal(tracker.observe(observation("full","codegraph","X".repeat(EXPLORER_OUTPUT_LIMIT_BYTES))),false);
 assert.equal(tracker.observe(observation("extra","read","Y")),true);
 assert.equal(tracker.snapshot().outputBytes,EXPLORER_OUTPUT_LIMIT_BYTES+1);
});
test("EF-202 a repeated tool completion cannot inflate telemetry",()=>{
 const tracker=new ExplorerBudgetTelemetry();
 assert.equal(tracker.observe(observation("1","read","hello")),false);
 assert.equal(tracker.observe(observation("1","read","hello")),false);
 assert.equal(tracker.snapshot().queries,1);
 assert.equal(tracker.snapshot().outputBytes,5);
});
test("EF-202 writing and unrecognized tools never count as read queries",()=>{
 const tracker=new ExplorerBudgetTelemetry();
 for(const name of ["bash","edit","write","unknown"])assert.equal(tracker.observe(observation(name,name)),false);
 assert.equal(tracker.observe(observation("","read")),false);
 assert.equal(tracker.snapshot().queries,0);
});
test("EF-202 observation snapshots never retain private tool output",()=>{
 const tracker=new ExplorerBudgetTelemetry();
 tracker.observe(observation("1","read","PRIVATE_MARKER_123"));
 assert.equal(JSON.stringify(tracker.snapshot()).includes("PRIVATE_MARKER_123"),false);
 assert.equal(tracker.snapshot().outputBytes,18);
});
