import test from "node:test";import assert from "node:assert/strict";import {ASEN_COMMAND_CATALOG,implementedCommands,missingCommands} from "../src/runtime/command-catalog.js";
test("public ODD-only command inventory is unique and never hides missing surfaces",()=>{assert.equal(new Set(ASEN_COMMAND_CATALOG.map(x=>x.name)).size,ASEN_COMMAND_CATALOG.length);assert.deepEqual(implementedCommands().sort(),["asen","asen-accept-review","asen-agent-follow","asen-agent-inspect","asen-agents","asen-authority-status","asen-banner","asen-changes","asen-changes-view","asen-commands","asen-continue","asen-customize","asen-doctor","asen-help","asen-history","asen-integrations","asen-job-inspect","asen-language","asen-memory","asen-mode","asen-palette","asen-panel","asen-presentation","asen-persona","asen-plan","asen-profiles","asen-research-probe","asen-review","asen-route","asen-skill-registry","asen-stats","asen-status","asen-task-agents","asen-telemetry","asen-todos","asen-usage","asen-yolo"].sort());assert.deepEqual(missingCommands(),[]);});
test("task-agents has exactly one implemented session catalog entry",()=>{
 assert.deepEqual(ASEN_COMMAND_CATALOG.filter(row=>row.name==="asen-task-agents"),[
  {group:"session",name:"asen-task-agents",implemented:true,owner:"extensions/asen.ts"},
 ]);
 assert.equal(implementedCommands().filter(name=>name==="asen-task-agents").length,1);
 assert.equal(ASEN_COMMAND_CATALOG.length,37);
});
