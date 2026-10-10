import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
// @ts-expect-error Research-only report runner is outside the runtime package.
import {assertCandidateReportMatches,assertExactCandidate,bindEcosystemDriftReport,validateEcosystemCandidateReport,verifyEcosystemCandidateReport} from "../scripts/ecosystem-candidate-report.mjs";
// @ts-expect-error Research-only Git-object collector is outside the runtime package.
import {collectBaseline,detectBaselineDrift} from "../scripts/ecosystem-baseline.mjs";

function fixture(t:test.TestContext){
 const root=mkdtempSync(join(tmpdir(),"asen-eco-report-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","core.autocrlf","false");git("config","user.name","Fixture");git("config","user.email","fixture@example.test");
 mkdirSync(join(root,"extensions"));writeFileSync(join(root,"package.json"),JSON.stringify({name:"fixture",version:"1.0.0"}));
 writeFileSync(join(root,"extensions","a.ts"),"export const value = 1;\n");writeFileSync(join(root,"extensions","b.ts"),"export const other = 1;\n");
 git("add",".");git("commit","-qm","frozen");return {root,git,commit:git("rev-parse","HEAD")};
}
const hash=(value:Buffer|string)=>createHash("sha256").update(value).digest("hex");

test("drift report binds inputs, requirements and evidence deterministically without adoption",t=>{
 const f=fixture(t),before=collectBaseline(f.root,f.commit),source=before.files.find((row:any)=>row.path==="extensions/a.ts");
 writeFileSync(join(f.root,"extensions","a.ts"),"export const value = 2;\n");f.git("add",".");f.git("commit","-qm","candidate");
 const after=collectBaseline(f.root,f.git("rev-parse","HEAD")),drift=detectBaselineDrift(before,after);
 const mappingBytes=Buffer.from(JSON.stringify({version:1,baselineCommit:before.commit,mappings:[]})),adjudicationBytes=Buffer.from(JSON.stringify({version:1,baselineCommit:before.commit,adjudications:[]}));
 const rows=[
  {id:"ECO-01",status:"FULL",sourceHashes:[source.sha256],evidence:[{id:"proof-1",recordPath:"registry/evidence/ecosystem/proof.json"}]},
  {id:"ECO-02",status:"FULL",sourceHashes:[before.files.find((row:any)=>row.path==="extensions/b.ts").sha256],evidence:[]},
  ...Array.from({length:14},(_,index)=>({id:`ECO-${String(index+3).padStart(2,"0")}`,status:"PARTIAL",sourceHashes:[before.files.find((row:any)=>row.path==="extensions/b.ts").sha256],evidence:[]})),
 ];
 const claimsBytes=Buffer.from(JSON.stringify({version:1,sourceCommit:before.commit,rows}));
 const args={baseline:before,after,drift,mappingBytes,adjudicationBytes,claimsBytes};
 const first=bindEcosystemDriftReport(args),second=bindEcosystemDriftReport(args);
 assert.deepEqual(first,second);assert.equal(validateEcosystemCandidateReport(first),true);assert.equal(first.autoAdopt,false);
 assert.equal(first.inputs.baselineSha256,hash(JSON.stringify(before)));
 assert.deepEqual(assertCandidateReportMatches(first,first),first);
 assert.deepEqual(first.affectedRequirements,[{requirementId:"ECO-01",claimStatus:"FULL",auditRequired:true,effectiveStatus:"INVALIDATED",invalidatedSourcePaths:["extensions/a.ts"],evidence:[{id:"proof-1",path:"registry/evidence/ecosystem/proof.json",sha256:null}]}]);
 assert.ok(first.changes.some((row:any)=>row.kind==="CONTENT_CHANGED"&&row.path==="extensions/a.ts"));
 const forged={...first,changes:[],invalidatedPaths:[],affectedRequirements:[]};
 const {integritySha256,...unsigned}=forged;forged.integritySha256=hash(JSON.stringify(unsigned));
 assert.equal(validateEcosystemCandidateReport(forged),true,"the unkeyed digest alone only detects accidental edits");
 assert.throws(()=>assertCandidateReportMatches(first,forged),/does not match re-derived/);
 assert.throws(()=>verifyEcosystemCandidateReport(f.root,first,{baselineBytes:JSON.stringify(before),mappingBytes,adjudicationBytes,claimsBytes}),/runtime edge mapping envelope/);
});

test("report validation rejects identity edits, evidence edits and auto-adoption",t=>{
 const f=fixture(t),baseline=collectBaseline(f.root,f.commit),after=collectBaseline(f.root,f.commit),drift=detectBaselineDrift(baseline,after);
 const claimsBytes=Buffer.from(JSON.stringify({version:1,sourceCommit:baseline.commit,rows:Array.from({length:16},(_,index)=>({id:`ECO-${String(index+1).padStart(2,"0")}`,status:"PARTIAL",sourceHashes:[baseline.files[0].sha256],evidence:[]}))}));
 const mappings=JSON.stringify({version:1,baselineCommit:baseline.commit,mappings:[]}),adjudications=JSON.stringify({version:1,baselineCommit:baseline.commit,adjudications:[]});
 const report=bindEcosystemDriftReport({baseline,after,drift,mappingBytes:mappings,adjudicationBytes:adjudications,claimsBytes});
 assert.equal(validateEcosystemCandidateReport(report),true);
 assert.equal(validateEcosystemCandidateReport({...report,autoAdopt:true}),false);
 assert.equal(validateEcosystemCandidateReport({...report,inputs:{...report.inputs,candidateCommit:"0".repeat(40)}}),false);
 assert.equal(validateEcosystemCandidateReport({...report,affectedRequirements:[...report.affectedRequirements,{requirementId:"ECO-99",claimStatus:"FULL",invalidatedSourcePaths:[],evidence:[]}]}),false);
 assert.throws(()=>bindEcosystemDriftReport({baseline,after,drift,baselineBytes:"{}",mappingBytes:mappings,adjudicationBytes:adjudications,claimsBytes}),/Baseline bytes do not identify/);
 assert.throws(()=>bindEcosystemDriftReport({baseline,after,drift,mappingBytes:"{}",adjudicationBytes:adjudications,claimsBytes}),/Drift mappings are not bound/);
 assert.throws(()=>bindEcosystemDriftReport({baseline,after,drift,mappingBytes:mappings,adjudicationBytes:adjudications,claimsBytes:JSON.stringify({version:1,sourceCommit:baseline.commit,rows:Array.from({length:16},(_,index)=>({id:`ECO-${String(index+1).padStart(2,"0")}`,status:"PARTIAL",sourceHashes:["f".repeat(64)],evidence:[]}))})}),/unresolved source identity/);
 assert.throws(()=>bindEcosystemDriftReport({baseline,after,drift:{...drift,invalidatedPaths:["../escape"]},mappingBytes:mappings,adjudicationBytes:adjudications,claimsBytes}),/invalid or adoptive/);
});

test("candidate identity must resolve to an exact descendant commit",t=>{
 const f=fixture(t);writeFileSync(join(f.root,"extensions","a.ts"),"export const value = 2;\n");f.git("add",".");f.git("commit","-qm","candidate");
 const candidate=f.git("rev-parse","HEAD");assert.doesNotThrow(()=>assertExactCandidate(f.root,candidate,f.commit));
 f.git("checkout","--orphan","unrelated");f.git("rm","-rf",".");
 mkdirSync(join(f.root,"extensions"));writeFileSync(join(f.root,"package.json"),JSON.stringify({name:"fixture",version:"1.0.0"}));
 writeFileSync(join(f.root,"extensions","a.ts"),"export const unrelated = true;\n");f.git("add",".");f.git("commit","-qm","unrelated");
 assert.throws(()=>assertExactCandidate(f.root,candidate,f.git("rev-parse","HEAD")),/descendant/);
 assert.throws(()=>assertExactCandidate(f.root,"not-a-sha",f.commit),/exact full Git commit SHA/);
});
