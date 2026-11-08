import assert from "node:assert/strict";
import test from "node:test";
import {formatCommandGuide} from "../src/runtime/command-guide.js";
import type {CommandDiscovery,RegisteredCommand} from "../src/runtime/command-palette.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";

const entry=(name:string,group:string,description=""):RegisteredCommand=>({name,group,description,implemented:true,label:`/${name}`});
const discovery=(state:CommandDiscovery["state"],entries:RegisteredCommand[]=[],limited=false):CommandDiscovery=>({state,entries,limited});

test("empty query renders a bounded grouped manual guide without executing commands",()=>{
 let effects=0;
 const rows=[
  Object.assign(entry("asen-status","diagnostics","Show live status"),{handler:()=>effects++}),
  Object.assign(entry("external:check","extension","Inspect extension state"),{run:()=>effects++}),
  entry("asen-doctor","diagnostics","Run local checks"),
 ];
 const lines=formatCommandGuide(discovery("reported",rows),"",72);
 assert.deepEqual(lines.slice(0,2),["Registered command guide (manual invocation only).","[diagnostics]"]);
 assert.ok(lines.includes("/asen-status - Show live status"));
 assert.ok(lines.includes("[extension]"));
 assert.ok(lines.includes("/external:check - Inspect extension state"));
 assert.equal(lines.filter(value=>value==="[diagnostics]").length,1);
 assert.ok(lines.indexOf("/asen-doctor - Run local checks")<lines.indexOf("[extension]"));
 assert.equal(effects,0);
 assert.ok(lines.every(line=>visibleWidth(line)<=72));
});

test("an exact registered name uses its inspected public description and manual invocation",()=>{
 const lines=formatCommandGuide(discovery("reported",[
  entry("Skill:Build","skill","Build the selected skill"),
  entry("skill:other","skill","Other command"),
 ]),"  /skill:build  ",80);
 assert.deepEqual(lines,[
  "/Skill:Build - Build the selected skill",
  "Type /Skill:Build manually",
  "This guide does not execute the command.",
 ]);
});

test("known Jobs help describes bounded metadata with log tail and agent follow guidance",()=>{
 const lines=formatCommandGuide(discovery("reported",[entry("asen-job-inspect","workspace","Inspect owned Jobs")]),"asen-job-inspect",100).join("\n");
 assert.match(lines,/Type \/asen-job-inspect manually/u);
 assert.match(lines,/bounded, read-only log tail/iu);
 assert.match(lines,/historical, not resumed/iu);
 assert.match(lines,/native.*Stop.*owned live ASEN/iu);
 assert.match(lines,/Follow an agent journal with \/asen-agent-follow/u);
 assert.match(lines,/guide does not execute/iu);
});

test("unknown, empty and unavailable inventories stay truthful without catalog fallback",()=>{
 assert.match(formatCommandGuide(discovery("no-match"),"missing",80).join("\n"),/No exact registered command matches "missing"/);
 assert.match(formatCommandGuide(discovery("empty"),"",80).join("\n"),/No registered commands reported/);
 const unavailable=formatCommandGuide(discovery("unavailable",[entry("stale","core","must not appear")]),"stale",80).join("\n");
 assert.match(unavailable,/Registered command inventory unavailable/);
 assert.doesNotMatch(unavailable,/stale|must not appear/i);
});

test("untrusted text and duplicates are sanitized, bounded and disclosed",()=>{
 let privateReads=0;
 const first=Object.assign(entry("safe:one","extension","Public\u001b\u202e "+"界".repeat(200)),{
  handler(){assert.fail("must not execute");},
 });
 Object.defineProperty(first,"sourceInfo",{get(){privateReads++;throw new Error("PRIVATE");}});
 const lines=formatCommandGuide(discovery("reported",[first,entry("safe:one","extension","duplicate secret"),entry("safe:two","prompt","Second")]),"",60);
 const output=lines.join("\n");
 assert.equal(privateReads,0);
 assert.equal(lines.filter(line=>line.startsWith("/safe:one")).length,1);
 assert.match(output,/Limited view/);
 assert.doesNotMatch(output,/duplicate secret|PRIVATE/u);
 assert.ok(lines.every(line=>!/[\u0000-\u001f\u007f-\u009f\u202e]/u.test(line)&&visibleWidth(line)<=60));
});

test("query and forged public fields are bounded without reading private metadata",()=>{
 const forged={name:"bad name",group:"x\u0007",description:"hidden",implemented:true,label:"ignored"} as RegisteredCommand;
 const lines=formatCommandGuide(discovery("reported",[forged,entry("asen-help","configuration","")]),"\u001b]8;;"+"q".repeat(500),48);
 const output=lines.join("\n");
 assert.match(output,/No exact registered command matches/);
 assert.doesNotMatch(output,/PRIVATE|hidden/u);
 assert.ok(lines.every(line=>!/[\u0000-\u001f\u007f-\u009f]/u.test(line)&&visibleWidth(line)<=48));
});
