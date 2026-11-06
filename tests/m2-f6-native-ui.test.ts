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
 tail:["SECRET_LOG"],args:["SECRET_ARGS"],cwd:"SECRET_CWD",
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
 assert.doesNotMatch(rows,/SECRET_SHELL_COMMAND|SECRET_ARGS|SECRET_LOG|SECRET_CWD/u);
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
test("EF-603 Windows path identity normalizes case, extended drive and UNC aliases",()=>{
 const drive="C:\\ASEN\\Repo";
 assert.equal(workspaceIdentityPathKey(drive,"win32"),workspaceIdentityPathKey("\\\\?\\c:\\asen\\repo","win32"));
 assert.equal(workspaceIdentityPathKey("\\\\SERVER\\SHARE\\ASEN","win32"),
  workspaceIdentityPathKey("\\\\?\\UNC\\server\\share\\asen","win32"));
 assert.notEqual(workspaceIdentityPathKey("C:\\ASEN\\Repo","win32"),
  workspaceIdentityPathKey("C:\\ASEN\\Other","win32"));
});
