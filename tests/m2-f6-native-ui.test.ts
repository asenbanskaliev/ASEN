import test from "node:test";
import assert from "node:assert/strict";
import {createNativeM2Navigator} from "../src/runtime/native-m2-navigator.js";
import {projectJobMetadata} from "../src/runtime/job-inspect.js";
import {workspaceIdentityPathKey} from "../src/runtime/workspace-store.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";
import {KeybindingsManager,TUI_KEYBINDINGS} from "@earendil-works/pi-tui";
import type {AgentInspection} from "../src/runtime/agent-inspect.js";
import type {AgentNoticeRecoveryView} from "../src/runtime/agent-notification-journal.js";
const time="2026-11-06T06:00:00.000Z";
const agent=(id:string,state:"interrupted"|"running"|"completed"):AgentInspection=>({
 record:{id,role:"explorer",owner:{kind:"user",id:"pi:owned"},sessionId:"s",projectId:"p",
  state,createdAt:time,updatedAt:time,summary:"SECRET_AGENT_OUTPUT"},
 history:[{id,revision:1,state:"queued",at:time},{id,revision:2,state:"running",at:time}],
});
const notice:AgentNoticeRecoveryView={eventId:"event",agentId:"agent-1",state:"completed",
 delivery:"attempted",disposition:"TRANSPORT_UNCERTAIN_DO_NOT_REPLAY",
 createdAt:time,modelConsumedProven:false,writerAuthorized:false};
const job=(state:"running"|"interrupted"="running")=>projectJobMetadata({
 id:"job-1",sessionId:"s",projectId:"p",command:"SECRET_SHELL_COMMAND",
 mode:"monitor",state,createdAt:time,updatedAt:time,exitCode:null,eventCount:2,
 tail:["LOG_TAIL_VISIBLE"],args:["SECRET_ARGS"],cwd:"SECRET_CWD",
});
function fixture(){
 let redraws=0,closes=0,current=true,rows=15;
 return {controls:{requestRender(){redraws++;},close(){closes++;},terminalRows(){return rows;},
  stillCurrent(){return current;}},get:()=>({redraws,closes}),stale:()=>{current=false;},
  short:()=>{rows=8;}};
}
test("M2 native Agents: list/detail/back, durable notice is not model consumption",()=>{
 const ctx=fixture(),input={kind:"agents" as const,
  agents:[agent("agent-1","interrupted"),agent("agent-2","completed")],notices:[notice]};
 const before=structuredClone(input),view=createNativeM2Navigator(input,ctx.controls);
 for(const width of [12,40,80,139,160]){
  const lines=view.render(width);assert.ok(lines.every(x=>visibleWidth(x)<=width));
 }
 assert.match(view.render(90).join("\n"),/AGENTS.*2\/2/u);
 view.handleInput("\r");
 const detail=view.render(110).join("\n");
 assert.match(detail,/Persistent lifecycle/u);
 assert.match(detail,/TRANSPORT_UNCERTAIN_DO_NOT_REPLAY/u);
 assert.match(detail,/not model consumption|ACK != model consumption/u);
 assert.doesNotMatch(detail,/SECRET_AGENT_OUTPUT/u);
 view.handleInput("\u007f");
 view.handleInput("\t");
 assert.match(view.render(90).join("\n"),/attention.*1\/2/u);
 view.handleInput("j");assert.match(view.render(90).join("\n"),/agent-1/u);
 assert.deepEqual(input,before,"UI must not mutate durable snapshots or notices");
 ctx.stale();view.handleInput("j");
 assert.equal(ctx.get().closes,1);
 assert.match(view.render(70)[0]??"",/scope changed/u);
});
test("M2 Jobs: opaque metadata only, historical states never imply active process",()=>{
 const ctx=fixture(),view=createNativeM2Navigator({kind:"jobs",jobs:[job("running"),job("interrupted")]},ctx.controls);
 assert.match(view.render(100).join("\n"),/JOBS/u);
 view.handleInput("j");view.handleInput("\r");
 const rows=view.render(100).join("\n");
 assert.match(rows,/historical|Registry metadata|Observed exit code/u);
 assert.doesNotMatch(rows,/SECRET_SHELL_COMMAND|SECRET_ARGS|SECRET_CWD/u);
 assert.match(rows,/Log tail \(read-only/u);assert.match(rows,/LOG_TAIL_VISIBLE/u); // UFC-M2-04 authorized: retained log lines render bounded; execution payloads stay withheld.
 assert.match(rows,/ownership-checked background tool/u);
 view.handleInput("\u007f");view.handleInput("q");
 assert.equal(ctx.get().closes,1);
 ctx.short();assert.ok(view.render(15).every(x=>visibleWidth(x)<=15));
});
test("M2 honors Pi-native remapped input and rejects stale overlay without dispatch",()=>{
 const ctx=fixture(),keybindings=new KeybindingsManager(TUI_KEYBINDINGS,{
  "tui.select.down":"ctrl+n","tui.input.tab":"ctrl+t",
  "tui.select.confirm":"ctrl+f","tui.editor.deleteCharBackward":"ctrl+b",
  "tui.select.cancel":"ctrl+x"
 });
 const view=createNativeM2Navigator({kind:"agents",agents:[agent("agent-1","running"),agent("agent-2","completed")]},
  {...ctx.controls,keybindings});
 const first=view.render(90);
 view.handleInput("\u000e");
 assert.notDeepEqual(view.render(90),first);
 view.handleInput("\u0006");
 assert.match(view.render(100).join("\n"),/Persistent lifecycle/u);
 view.handleInput("\u0002");
 assert.match(view.render(100).join("\n"),/agent-2/u);
 view.handleInput("\u0018");
 assert.equal(ctx.get().closes,1);
 assert.equal(ctx.get().redraws>=3,true);
});
const settled=()=>new Promise<void>(resolve=>setImmediate(resolve));
test("M2 explicit refresh preserves identity/detail across reorder and updates state",async()=>{
 const ctx=fixture();let reads=0;
 const view=createNativeM2Navigator({kind:"agents",agents:[agent("a","running"),agent("b","running")]},
  {...ctx.controls,refresh:async()=>{reads++;return {kind:"agents",agents:[agent("b","completed"),agent("a","running")]};}});
 view.handleInput("j");view.handleInput("\r");
 assert.match(view.render(120).join("\n"),/r: refresh/u);
 view.handleInput("r");await settled();
 const text=view.render(120).join("\n");assert.match(text,/Persistent lifecycle/u);assert.match(text,/Task: b/u);assert.match(text,/explorer · completed/u);
 assert.equal(reads,1);view.handleInput("\u007f");assert.match(view.render(120).join("\n"),/> explorer · completed · b/u);
});
test("M2 refresh retains filter and falls back to bounded list for missing, capped, ambiguous or filtered identity",async()=>{
 for(const replacement of [[],[agent("b","running")],[agent("a","completed")],
  [agent("a","running"),agent("a","running")],
  [...Array.from({length:100},(_,i)=>agent("other-"+i,"running")),agent("a","running")]]){
  const ctx=fixture(),view=createNativeM2Navigator({kind:"agents",agents:[agent("a","running")]},
   {...ctx.controls,refresh:async()=>({kind:"agents",agents:replacement})});
  view.handleInput("\t");view.handleInput("\r");view.handleInput("j");view.handleInput("r");await settled();
  const text=view.render(120).join("\n");assert.match(text,/attention/u);assert.doesNotMatch(text,/Persistent lifecycle/u);
  if(!replacement.length||replacement[0]?.record.state==="completed")assert.match(text,/No owned agents/u);
  else assert.match(text,/> explorer/u);
 }
});
test("M2 refresh is single-flight, failure is generic, and closed or stale results are ignored",async()=>{
 for(const end of ["failure","close","drift"]){
  const ctx=fixture();let resolve!:(value:any)=>void,reject!:(error:Error)=>void,reads=0;
  const pending=new Promise<any>((yes,no)=>{resolve=yes;reject=no;});
  const view=createNativeM2Navigator({kind:"agents",agents:[agent("original","running")]},
   {...ctx.controls,refresh:()=>{reads++;return pending;}});
  view.handleInput("r");view.handleInput("r");await settled();assert.equal(reads,1);
  if(end==="close")view.handleInput("q");if(end==="drift")ctx.stale();
  const redraws=ctx.get().redraws;
  if(end==="failure")reject(Error("SECRET_ERROR"));else resolve({kind:"agents",agents:[agent("replacement","completed")]});
  await settled();const text=view.render(120).join("\n");assert.doesNotMatch(text,/SECRET_ERROR|replacement/u);
  if(end==="failure"){assert.match(text,/Refresh unavailable/u);assert.match(text,/original/u);}
  else assert.equal(ctx.get().redraws,redraws);
 }
});
test("M2 remapped cancellation wins over refresh and legacy snapshots do not advertise it",async()=>{
 const ctx=fixture();let reads=0;
 const keybindings={matches:(data:string,action:string)=>data==="r"&&action==="tui.select.cancel"};
 const view=createNativeM2Navigator({kind:"jobs",jobs:[job()]},{...ctx.controls,keybindings,
  refresh:async()=>{reads++;return {kind:"jobs",jobs:[]};}});
 view.handleInput("r");await settled();assert.equal(reads,0);assert.equal(ctx.get().closes,1);
 const legacy=createNativeM2Navigator({kind:"jobs",jobs:[job()]},fixture().controls);
 legacy.handleInput("r");assert.doesNotMatch(legacy.render(120).join("\n"),/r: refresh/u);
});
test("M2 ambiguous display-bounded job IDs never retain another job detail",async()=>{
 const ctx=fixture(),view=createNativeM2Navigator({kind:"jobs",jobs:[job()]},{...ctx.controls,
  refresh:async()=>({kind:"jobs",jobs:[job("running"),job("interrupted")]})});
 view.handleInput("\r");view.handleInput("r");await settled();
 assert.doesNotMatch(view.render(120).join("\n"),/Registry metadata/u);
 assert.match(view.render(120).join("\n"),/j\/k: select/u);
});
test("M2 truncated job IDs cannot retain detail across single-row projection collisions",async()=>{
 const metadata=(suffix:string)=>projectJobMetadata({id:"x".repeat(100)+suffix,sessionId:"s",projectId:"p",command:"secret",
  mode:"background",state:"running",createdAt:time,updatedAt:time,exitCode:null,eventCount:0,tail:[]});
 const before=metadata("a"),after=metadata("b");assert.equal(before.id,after.id);
 const view=createNativeM2Navigator({kind:"jobs",jobs:[before]},{...fixture().controls,
  refresh:async()=>({kind:"jobs",jobs:[after]})});
 view.handleInput("\r");view.handleInput("r");await settled();
 assert.match(view.render(120).join("\n"),/j\/k: select/u);
 assert.doesNotMatch(view.render(120).join("\n"),/Registry metadata/u);
});
test("EF-603 Windows path identity normalizes case, extended drive and UNC aliases",()=>{
 const drive="C:\\ASEN\\Repo";
 assert.equal(workspaceIdentityPathKey(drive,"win32"),workspaceIdentityPathKey("\\\\?\\c:\\asen\\repo","win32"));
 assert.equal(workspaceIdentityPathKey("\\\\SERVER\\SHARE\\ASEN","win32"),
  workspaceIdentityPathKey("\\\\?\\UNC\\server\\share\\asen","win32"));
 assert.notEqual(workspaceIdentityPathKey("C:\\ASEN\\Repo","win32"),
  workspaceIdentityPathKey("C:\\ASEN\\Other","win32"));
});
