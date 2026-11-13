import assert from "node:assert/strict";
import test from "node:test";
import {inspectRegisteredCommands} from "../src/runtime/command-palette.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";

test("live registration supplies names/descriptions; catalog supplies grouping only",()=>{
 const rows=[{name:"asen-status",description:"Live health",source:"extension"},{name:"other",description:"Review changes",source:"prompt"}];
 const result=inspectRegisteredCommands(()=>rows,"  HEALTH  ");
 assert.equal(result.state,"reported");
 assert.deepEqual(result.entries.map(row=>row.name),["asen-status"]);
 assert.equal(result.entries[0]?.description,"Live health");
 assert.equal(inspectRegisteredCommands(()=>rows,"prompt").entries[0]?.name,"other");
 assert.equal(inspectRegisteredCommands(()=>rows,"changes").entries[0]?.name,"other");
 assert.equal(inspectRegisteredCommands(()=>rows,"asen-help").state,"no-match");
 assert.equal(inspectRegisteredCommands(()=>rows,"  ").entries.length,2);
});

test("task-agents live metadata receives session grouping and session query inclusion",()=>{
 const rows=[{name:"asen-task-agents",description:"Live task coordination",source:"extension"}];
 const result=inspectRegisteredCommands(()=>rows);
 assert.equal(result.state,"reported");
 assert.deepEqual(result.entries,[{name:"asen-task-agents",group:"session",description:"Live task coordination",implemented:true,
  label:"/asen-task-agents [session] - Live task coordination"}]);
 assert.deepEqual(inspectRegisteredCommands(()=>rows,"session").entries,result.entries);
});

test("task-agents catalog membership never manufactures live registrations",()=>{
 const rows=[{name:"asen-status",description:"Live health",source:"extension"}];
 assert.equal(inspectRegisteredCommands(()=>rows,"asen-task-agents").state,"no-match");
 assert.deepEqual(inspectRegisteredCommands(()=>rows,"asen-task-agents").entries,[]);
 assert.deepEqual(inspectRegisteredCommands(()=>[]).entries,[]);
 assert.equal(inspectRegisteredCommands(undefined).state,"unavailable");
 assert.deepEqual(inspectRegisteredCommands(undefined).entries,[]);
 assert.equal(inspectRegisteredCommands(()=>[{name:"asen-task-agents"}],"unrelated-query").state,"no-match");
});

test("empty, no match and unavailable stay distinct without fabricated rows or errors",()=>{
 assert.equal(inspectRegisteredCommands(()=>[]).state,"empty");
 assert.equal(inspectRegisteredCommands(()=>[{name:"live"}],"missing").state,"no-match");
 for(const reader of [undefined,()=>{throw Error("PRIVATE");},()=>null]){
  const result=inspectRegisteredCommands(reader);
  assert.equal(result.state,"unavailable");assert.deepEqual(result.entries,[]);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|asen-help/);
 }
});

test("malformed/private metadata is withheld; labels are bounded, safe and unique",()=>{
 const rows=[null,{}, {name:"bad name"},{name:"/bad"},{name:"bad\u202e"},
  {name:"valid:1",description:"\x1b]8;;https://invalid\x07\u202e"+"界".repeat(5000),source:"skill",sourceInfo:{path:"PRIVATE"},auth:"SECRET"},
  {name:"valid:1",description:"duplicate"},{name:"valid:2",description:4},
  {name:"skill:check",description:"public",source:"skill"}];
 const result=inspectRegisteredCommands(()=>rows);
 assert.deepEqual(result.entries.map(row=>row.name),["valid:1","valid:2","skill:check"]);
 assert.equal(result.limited,true);
 assert.equal(new Set(result.entries.map(row=>row.label)).size,3);
 for(const row of result.entries){assert.ok(visibleWidth(row.label)<=240);assert.doesNotMatch(row.label,/[\x00-\x1f\u202e]/);}
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|SECRET|duplicate/);
});

test("scan and output caps are disclosed, and only bounded public descriptions are searched",()=>{
 const result=inspectRegisteredCommands(()=>Array.from({length:1000},(_,i)=>({name:`row-${i}`,description:"public",sourceInfo:{path:"private-marker"}})));
 assert.equal(result.entries.length,64);assert.equal(result.limited,true);
 assert.equal(inspectRegisteredCommands(()=>[{name:"row",sourceInfo:{path:"private-marker"}}],"private-marker").state,"no-match");
});
