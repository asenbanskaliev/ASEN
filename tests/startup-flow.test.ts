import test from "node:test";
import assert from "node:assert/strict";
import {ASEN_STARTUP_PHASES,renderStartupFlow} from "../src/runtime/startup-flow.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";
import {runAsen} from "../src/cli.js";
import {homedir} from "node:os";

test("startup flow declares the real cli cascade in one ordered place",()=>{
 assert.deepEqual(ASEN_STARTUP_PHASES.map(phase=>phase.id),[
  "lifecycle","managed-parse","arguments","command-branch","launcher-config",
  "home-resolution","pi-runtime","argument-guard","extension-declaration","spawn",
 ]);
 for(const phase of ASEN_STARTUP_PHASES){
  assert.ok(phase.owner.startsWith("src/"),phase.id+" must name a repository owner");
  assert.ok(phase.does.length>=20,phase.id+" must explain what it does");
  assert.ok(phase.fails.length>=10,phase.id+" must explain when it fails");
 }
});

test("startup flow renders a bounded, sanitized, frozen read-only projection",()=>{
 const rows=renderStartupFlow(88);
 assert.ok(Object.isFrozen(rows));
 assert.ok(rows[0]!.includes("read-only"));
 assert.ok(rows.some(row=>row.includes("descriptive only")));
 for(const phase of ASEN_STARTUP_PHASES){
  assert.ok(rows.some(row=>row.includes(phase.id)),"missing phase "+phase.id);
  assert.ok(rows.some(row=>row.includes(phase.owner)),"missing owner "+phase.owner);
 }
 for(const row of rows){
  assert.ok(visibleWidth(row)<=88,"row exceeds width: "+row);
  assert.ok(!row.includes("\u001b"));
  assert.ok(!row.includes("\n"));
 }
 assert.deepEqual(renderStartupFlow(88),rows);
});

test("startup flow rejects an out-of-range width",()=>{
 assert.throws(()=>renderStartupFlow(9),/width/u);
 assert.throws(()=>renderStartupFlow(1001),/width/u);
 assert.throws(()=>renderStartupFlow(80.5),/width/u);
});

test("asen startup prints the projection and executes nothing",async()=>{
 const out:string[]=[],err:string[]=[];
 const code=await runAsen(["startup"],{},{homeDirectory:homedir,stdout:text=>out.push(text),stderr:text=>err.push(text)});
 assert.equal(code,0);
 assert.deepEqual(err,[]);
 const text=out.join("");
 assert.ok(text.includes("read-only"));
 assert.ok(text.includes("spawn"));
});

test("asen startup rejects unsupported arguments instead of launching Pi",async()=>{
 const out:string[]=[],err:string[]=[];
 const code=await runAsen(["startup","--apply"],{},{homeDirectory:homedir,stdout:text=>out.push(text),stderr:text=>err.push(text)});
 assert.equal(code,2);
 assert.deepEqual(out,[]);
 assert.ok(err.join("").includes("startup"));
});
