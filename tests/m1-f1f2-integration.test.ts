import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {renderM1Surface,createM1SurfaceCache} from "../src/runtime/m1-readonly-rail.js";
import {inspectCodeGraphFirst} from "../src/runtime/explorer-read-policy.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";
import {deriveOddFacts,planOddRoute} from "../src/flow/odd-routing.js";
const base={todos:[],agents:[],jobs:[]};
test("M1 rail headers retain Shell section order, no false done and no redraw",()=>{
 const t={title:"Read-only review",current:{state:"succeeded"}} as any;
 const s={...base,todos:[t],changes:{branch:"feat/test",files:1}};
 const out=renderM1Surface(s,160);
 assert.equal(out.mode,"rail");assert.equal(out.lines.length,7);
 assert.deepEqual(out.lines.slice(1).map(x=>x.replace(/^│ ▾ /u,"").split(" · ")[0]),
 ["TODOS","JOBS","AGENTS","CHANGES","REVIEW","INTEGRATIONS"]);
 assert.match(out.lines.join("\n"),/0\/1/);
 assert.ok(out.lines.every(x=>visibleWidth(x)<=160));
 const c=createM1SurfaceCache();assert.ok(c.next(s,160,"s1/p1"));
 assert.equal(c.next(s,160,"s1/p1"),undefined);
 assert.ok(c.next(s,160,"s2/p1"));c.reset();assert.ok(c.next(s,160,"s2/p1"));
});
test("M1 exact 140 breakpoint, narrow width and sanitization",()=>{
 const s={...base,agents:[{role:"explorer",state:"running"} as any]};
 for(const width of [12,35,49,50,80,120,139]){
  const r=renderM1Surface(s,width);assert.notEqual(r.mode,"rail");
  assert.ok(r.lines.every(x=>visibleWidth(x)<=width));
 }
 for(const width of [140,160])assert.equal(renderM1Surface(s,width).mode,"rail");
 assert.deepEqual(renderM1Surface(base,139).lines,[]);
 assert.throws(()=>renderM1Surface(base,11));
});
test("F1 real ODD router keeps bounded direct and blocks unknown and sensitive decisions",()=>{
 const original={taskIdentity:"F1-test",repositoryIdentity:"read-only",intent:"analysis",
  scope:{kind:"known",expectedPaths:["README.md"]},writes:[],riskOperations:[],
  session:{estimatedMinutes:3,continuation:false},testing:{kind:"n_a",reason:"read-only"},
  review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[]};
 const route=(updates:any)=>planOddRoute(deriveOddFacts({...original,...updates} as any));
 assert.equal(route({}).route,"direct");
 assert.equal(route({scope:{kind:"unknown",reason:"not inspected"}}).route,"plan");
 assert.equal(route({riskOperations:["security_boundary"]}).route,"plan");
});
test("F2 invokes CodeGraph query before fallback without index writes",async t=>{
 const dir=mkdtempSync(join(tmpdir(),"asen-m1-codegraph-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 execFileSync("git",["init","-q",dir]);writeFileSync(join(dir,"README.md"),"keep\n");
 const calls:string[][]=[];
 const missing=async(args:readonly string[])=>{calls.push([...args]);throw Object.assign(Error("missing"),{code:"ENOENT"});};
 const missingResult=await inspectCodeGraphFirst(dir,"name",missing);
 assert.deepEqual(calls,[["query","--limit","5","--","name"]]);
 assert.equal(missingResult.status,"unavailable");
 assert.equal(missingResult.fallback,"read/grep");
 assert.equal(missingResult.writesAllowed,false);
 const result=await inspectCodeGraphFirst(dir,"name",async()=>({stdout:"symbol name",stderr:""}));
 assert.equal(result.status,"completed");assert.equal(result.fallback,null);
 assert.equal(readFileSync(join(dir,"README.md"),"utf8"),"keep\n");
 await assert.rejects(()=>inspectCodeGraphFirst(dir,"invalid\nquery",missing),/Invalid/);
});
