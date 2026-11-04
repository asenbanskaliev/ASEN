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

test("EF-201 write-capable CodeGraph init/sync are never counted as read queries",()=>{
 const tracker=new ExplorerBudgetTelemetry();
 assert.equal(tracker.observe({...observation("init","codegraph","X".repeat(50_000)),args:{operation:"init"}}),false);
 assert.equal(tracker.observe({...observation("sync","codegraph","X".repeat(50_000)),result:{details:{operation:"sync"},content:[{type:"text",text:"X".repeat(50_000)}]}}),false);
 assert.equal(tracker.observe({...observation("legacy","asen_code_intelligence"),args:{operation:"init"}}),false);
 assert.deepEqual(tracker.snapshot().queries,0);
 assert.deepEqual(tracker.snapshot().outputBytes,0);
 assert.equal(tracker.observe({...observation("query","codegraph"),args:{operation:"query"}}),false);
 assert.equal(tracker.snapshot().firstTool,"codegraph");
 assert.equal(tracker.snapshot().queries,1);
});

test("EF-201 unknown CodeGraph operations and conflicting write receipts never consume read-only Explorer budget",()=>{
 const tracker=new ExplorerBudgetTelemetry();
 const event=observation("write","codegraph","X".repeat(50_000));
 const variants=[
  {...event,args:{operation:"query"},result:{...event.result,details:{operation:"sync"}}},
  {...event,toolCallId:"init-conflict",args:{operation:"init"},result:{...event.result,details:{operation:"query"}}},
  {...event,toolCallId:"unknown",args:{operation:"reindex"}},
  {...event,toolCallId:"non-string",args:{operation:17}},
  {...event,toolCallId:"legacy-write",toolName:"asen_code_intelligence",result:{...event.result,details:{operation:"init"}}},
 ];
 for(const attempt of variants)assert.equal(tracker.observe(attempt),false);
 assert.equal(tracker.snapshot().queries,0);
 assert.equal(tracker.snapshot().outputBytes,0);
 assert.equal(tracker.snapshot().firstTool,undefined);
 assert.equal(tracker.snapshot().recommendationIssued,false);
 assert.equal(tracker.observe({...event,toolCallId:"safe",args:{operation:"query"},result:{...event.result,content:[{type:"text",text:"q"}],details:{operation:"query"}}}),false);
 assert.equal(tracker.snapshot().queries,1);
 assert.equal(tracker.snapshot().outputBytes,1);
 assert.equal(tracker.snapshot().firstTool,"codegraph");
});
test("EF-202 only four observed read queries trigger one suggestion after rejected CodeGraph writes",()=>{
 const tracker=new ExplorerBudgetTelemetry();
 for(let i=0;i<8;i++)assert.equal(tracker.observe({...observation(`write-${i}`,"codegraph"),args:{operation:"sync"}}),false);
 for(let i=0;i<3;i++)assert.equal(tracker.observe({...observation(`read-${i}`,"codegraph"),args:{operation:"query"}}),false);
 assert.equal(tracker.snapshot().queries,3);
 assert.equal(tracker.observe({...observation("read-3","codegraph"),args:{operation:"query"}}),true);
 assert.equal(tracker.observe(observation("read-4")),false);
 assert.equal(tracker.snapshot().queries,4);
 assert.equal(tracker.snapshot().recommendationIssued,true);
});

