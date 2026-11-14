import test from "node:test";
import assert from "node:assert/strict";
import {agentStatusRows,type PublicAgentRecord} from "../src/runtime/agent-lifecycle.js";
import {statusLines,type AsenStatusInput} from "../src/runtime/status.js";
import {recordWorkspaceChange,visibleWorkspaceConflictRows,visibleWorkspaceRows} from "../src/runtime/workspace-attribution.js";
import {hostContentColumns,layoutMode,truncateForTerminal,visibleWidth} from "../src/runtime/responsive-layout.js";

const WIDTHS=[120,80,60,40] as const;
const RAW_CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/u;
const ADVERSARIAL={
 doubleWidth:"界".repeat(80),
 zwjFamily:"👩‍👩‍👧‍👦".repeat(30),
 combining:"e\u0301".repeat(60),
 ansi:"\u001b[31mred\u001b[0m and \u001b[2Jclear",
 control:"\u0007bell\u0000nul\u001b]0;title\u0007",
 long:"word ".repeat(60).trim(),
 emoji:"🚀".repeat(50),
};

function bounded(lines:readonly string[],width:number,label:string){
 assert.ok(lines.length>0,`${label} must render at least one row`);
 for(const line of lines){
  assert.equal(typeof line,"string",`${label} rows are strings`);
  assert.ok(visibleWidth(line)<=width,`${label} visible width ${visibleWidth(line)} must not exceed ${width}: ${JSON.stringify(line)}`);
  assert.ok(!RAW_CONTROL.test(line),`${label} must not leak a raw control character: ${JSON.stringify(line)}`);
 }
}

function agentRecord(overrides:Partial<PublicAgentRecord>={}):PublicAgentRecord{
 return {id:"agent-1",role:"worker",owner:{kind:"user",id:"owner-1"},sessionId:"session-1",projectId:"/project",state:"running",createdAt:"2026-10-31T00:00:00.000Z",updatedAt:"2026-10-31T00:00:01.000Z",...overrides};
}

function workspaceChange(path:string,actorId:string){
 return recordWorkspaceChange({path,actor:{kind:"user",id:actorId},sessionId:"session-1",projectId:"/project",worktree:"/project",operation:"modify",at:"2026-10-31T00:00:00.000Z"});
}

test("T10-7 bounds Pi host output one gutter inside the terminal width",()=>{
 assert.equal(hostContentColumns(120),117);
 assert.equal(hostContentColumns(80),77);
 assert.equal(hostContentColumns(60),57);
 assert.equal(hostContentColumns(40),37);
 assert.equal(hostContentColumns(1),1,"a non-empty view keeps at least one column");
 assert.throws(()=>hostContentColumns(0),"zero-width terminals stay invalid");
 assert.throws(()=>hostContentColumns(1.5),"non-integer widths stay invalid");
});

test("T10-7 selects a stable layout for every supported terminal width",()=>{
 assert.equal(layoutMode(120),"wide");
 assert.equal(layoutMode(80),"compact");
 assert.equal(layoutMode(60),"narrow");
 assert.equal(layoutMode(40),"minimum");
 for(const width of WIDTHS)assert.ok(width>=40,"the matrix covers only widths Pi can host");
});

test("T10-7 status stays inside every supported column budget",()=>{
 for(const width of WIDTHS){
  for(const [name,value] of Object.entries(ADVERSARIAL)){
   const input:AsenStatusInput={agents:[agentRecord({summary:value})],changes:[workspaceChange(value.replace(/[\u0000-\u001f]/gu,"_")||"file.txt",`actor-${name}`)],skills:{enabled:true,count:3},profile:value.replace(/[\u0000-\u001f]/gu,"_")||"default",historyEnabled:true,telemetryEnabled:false};
   bounded(statusLines(input,width),width,`status/${name}`);
  }
 }
});

test("T10-7 agent rows stay inside every supported column budget",()=>{
 for(const width of WIDTHS){
  for(const [name,value] of Object.entries(ADVERSARIAL)){
   const records=[agentRecord({id:value.replace(/[\u0000-\u001f]/gu,"_")||"agent-1",role:value.replace(/[\u0000-\u001f]/gu,"_")||"worker",summary:value})];
   bounded(agentStatusRows(records,width),width,`agents/${name}`);
  }
  bounded(agentStatusRows([agentRecord({state:"interrupted"})],width),width,"agents/interrupted");
 }
});

test("T10-7 workspace and conflict rows stay inside every supported column budget",()=>{
 for(const width of WIDTHS){
  for(const [name,value] of Object.entries(ADVERSARIAL)){
   const path=value.replace(/[\u0000-\u001f]/gu,"_")||"file.txt";
   bounded(visibleWorkspaceRows([workspaceChange(path,`actor-${name}`)],width),width,`changes/${name}`);
   const earlier=workspaceChange(path,"first-writer");
   const later={...workspaceChange(path,"second-writer"),actor:{kind:"agent" as const,id:"second-writer"}};
   bounded(visibleWorkspaceConflictRows([{path:earlier.path,earlier,later}],width),width,`conflicts/${name}`);
  }
 }
});

test("T10-7 empty views render no row instead of an invented placeholder",()=>{
 for(const width of WIDTHS){
  assert.deepEqual(agentStatusRows([],width),[]);
  assert.deepEqual(visibleWorkspaceRows([],width),[]);
  assert.deepEqual(visibleWorkspaceConflictRows([],width),[]);
 }
});

test("T10-7 truncation keeps a grapheme cluster whole and marks the cut",()=>{
 for(const width of WIDTHS){
  const raw=ADVERSARIAL.zwjFamily,cut=truncateForTerminal(raw,width);
  assert.ok(visibleWidth(cut)<=width);
  assert.equal(cut.endsWith("…"),visibleWidth(raw)>width,`only a real cut is marked as truncated at ${width}`);
  assert.ok(!cut.endsWith("\u200d"),"a truncated row must not end on a zero-width joiner");
  assert.ok(!/[\uFE00-\uFE0F]$/u.test(cut),"a truncated row must not end on a variation selector");
  assert.ok(!/^\u0301/u.test(truncateForTerminal(ADVERSARIAL.combining,width)),"a truncated row must not start with an orphaned combining mark");
 }
});

test("T10-7 escape sequences are made inert rather than forwarded",()=>{
 for(const width of WIDTHS){
  const rendered=agentStatusRows([agentRecord({summary:ADVERSARIAL.ansi})],width)[0]!;
  assert.ok(!rendered.includes("\u001b"),`an escape introducer must never survive rendering at ${width}`);
  const roomy=agentStatusRows([agentRecord({summary:ADVERSARIAL.ansi})],120)[0]!;
  assert.ok(roomy.includes("\uFFFD"),"a replaced control must be visible as a replacement character when the row has room for it");
 }
});