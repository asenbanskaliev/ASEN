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
 assert.equal(first.anchorDiffs.some((row:any)=>row.path==="extensions/a.ts"&&row.before.length===1&&row.after.length===1),true,"report carries exact old/new normative anchor identities and hashes");
 assert.deepEqual(assertCandidateReportMatches(first,first),first);
 assert.deepEqual(first.affectedRequirements,[{requirementId:"ECO-01",claimStatus:"FULL",auditRequired:true,impactBasis:"SOURCE_MAP",effectiveStatus:"INVALIDATED",invalidatedSourcePaths:["extensions/a.ts"],evidence:[{id:"proof-1",path:"registry/evidence/ecosystem/proof.json",sha256:null}]}]);
 assert.ok(first.changes.some((row:any)=>row.kind==="CONTENT_CHANGED"&&row.path==="extensions/a.ts"));
 const forged={...first,changes:[],invalidatedPaths:[],anchorDiffs:[],affectedRequirements:[]};
 const {integritySha256,...unsigned}=forged;forged.integritySha256=hash(JSON.stringify(unsigned));
 assert.equal(validateEcosystemCandidateReport(forged),true,"the unkeyed digest alone only detects accidental edits");
 assert.throws(()=>assertCandidateReportMatches(first,forged),/does not match re-derived/);
 const forgedAnchor={...first,anchorDiffs:first.anchorDiffs.map((row:any)=>({...row,after:[]}))};
 const {integritySha256:anchorDigest,...anchorUnsigned}=forgedAnchor;forgedAnchor.integritySha256=hash(JSON.stringify(anchorUnsigned));
 assert.throws(()=>assertCandidateReportMatches(first,forgedAnchor),/does not match re-derived/);
 assert.throws(()=>verifyEcosystemCandidateReport(f.root,first,{baselineBytes:JSON.stringify(before),mappingBytes,adjudicationBytes,claimsBytes}),/runtime edge mapping envelope/);
});

test("unmapped changed sources conservatively require every ECO row to be audited",t=>{
 const f=fixture(t),baseline=collectBaseline(f.root,f.commit),packagePath=join(f.root,"package.json");
 writeFileSync(packagePath,JSON.stringify({name:"fixture",version:"1.0.0",dependencies:{added:"^1.0.0"}}));
 f.git("add",".");f.git("commit","-qm","add unmapped dependency");
 const after=collectBaseline(f.root,f.git("rev-parse","HEAD")),drift=detectBaselineDrift(baseline,after);
 const mappingBytes=Buffer.from(JSON.stringify({version:1,baselineCommit:baseline.commit,mappings:[]})),adjudicationBytes=Buffer.from(JSON.stringify({version:1,baselineCommit:baseline.commit,adjudications:[]}));
 const source=baseline.files.find((row:any)=>row.path==="extensions/a.ts");
 const claimsBytes=Buffer.from(JSON.stringify({version:1,sourceCommit:baseline.commit,rows:Array.from({length:16},(_,index)=>({id:"ECO-"+String(index+1).padStart(2,"0"),status:"PARTIAL",sourceHashes:[source.sha256],evidence:[]}))}));
 const report=bindEcosystemDriftReport({baseline,after,drift,mappingBytes,adjudicationBytes,claimsBytes});
 assert.deepEqual(report.unmappedImpactPaths,["package.json"]);
 assert.equal(report.affectedRequirements.length,16);
 assert.ok(report.affectedRequirements.every((row:any)=>row.impactBasis==="CONSERVATIVE_UNMAPPED_FALLBACK"&&row.invalidatedSourcePaths.includes("package.json")));
 assert.equal(validateEcosystemCandidateReport(report),true);
});

test("implementation-only source edits appear in exact content anchor snapshots",t=>{
 const f=fixture(t);
 writeFileSync(join(f.root,"extensions","b.ts"),"const implementation = 1;\n");
 f.git("add",".");f.git("commit","-qm","anchorless source");
 const baseline=collectBaseline(f.root,f.git("rev-parse","HEAD"));
 writeFileSync(join(f.root,"extensions","b.ts"),"const implementation = 2;\n");
 f.git("add",".");f.git("commit","-qm","implementation-only change");
 const after=collectBaseline(f.root,f.git("rev-parse","HEAD")),drift=detectBaselineDrift(baseline,after);
 const source=baseline.files.find((row:any)=>row.path==="extensions/b.ts");
 assert.deepEqual(source.anchors,[]);
 const mappingBytes=Buffer.from(JSON.stringify({version:1,baselineCommit:baseline.commit,mappings:[]}));
 const adjudicationBytes=Buffer.from(JSON.stringify({version:1,baselineCommit:baseline.commit,adjudications:[]}));
 const claimsBytes=Buffer.from(JSON.stringify({version:1,sourceCommit:baseline.commit,rows:Array.from({length:16},(_,index)=>({
  id:`ECO-${String(index+1).padStart(2,"0")}`,status:"PARTIAL",sourceHashes:[source.sha256],evidence:[]}))}));
 const report=bindEcosystemDriftReport({baseline,after,drift,mappingBytes,adjudicationBytes,claimsBytes});
 const anchorDiff=report.anchorDiffs.find((row:any)=>row.path==="extensions/b.ts");
 assert.deepEqual(anchorDiff.before,[{line:1,kind:"source-content",sha256:source.sha256}]);
 assert.deepEqual(anchorDiff.after,[{line:1,kind:"source-content",sha256:after.files.find((row:any)=>row.path==="extensions/b.ts").sha256}]);
 assert.equal(validateEcosystemCandidateReport(report),true);
});

test("report validation rejects identity edits, evidence edits and auto-adoption",t=>{
 const f=fixture(t),baseline=collectBaseline(f.root,f.commit),after=collectBaseline(f.root,f.commit),drift=detectBaselineDrift(baseline,after);
 const claimsBytes=Buffer.from(JSON.stringify({version:1,sourceCommit:baseline.commit,rows:Array.from({length:16},(_,index)=>({id:`ECO-${String(index+1).padStart(2,"0")}`,status:"PARTIAL",sourceHashes:[baseline.files[0].sha256],evidence:[]}))}));
 const mappings=JSON.stringify({version:1,baselineCommit:baseline.commit,mappings:[]}),adjudications=JSON.stringify({version:1,baselineCommit:baseline.commit,adjudications:[]});
 const report=bindEcosystemDriftReport({baseline,after,drift,mappingBytes:mappings,adjudicationBytes:adjudications,claimsBytes});
 assert.equal(validateEcosystemCandidateReport(report),true);
 assert.equal(report.schema,"asen.ecosystem-drift-report.v3");
 assert.equal(validateEcosystemCandidateReport({...report,schema:"asen.ecosystem-drift-report.v2"}),false,"the expanded report contract has an explicit schema version");
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

test("candidate ancestry ignores malicious Git replacement objects",t=>{
 const f=fixture(t);
 writeFileSync(join(f.root,"extensions","a.ts"),"export const value = 3;\n");
 f.git("add",".");f.git("commit","-qm","descendant");
 const descendant=f.git("rev-parse","HEAD");
 f.git("checkout","--orphan","independent");f.git("rm","-rf",".");
 mkdirSync(join(f.root,"extensions"));
 writeFileSync(join(f.root,"package.json"),JSON.stringify({name:"fixture",version:"1.0.0"}));
 writeFileSync(join(f.root,"extensions","a.ts"),"export const independent = true;\n");
 f.git("add",".");f.git("commit","-qm","independent");
 const unrelated=f.git("rev-parse","HEAD");
 // A replace ref can make a disconnected commit appear to have descendant ancestry.
 f.git("replace",unrelated,descendant);
 assert.throws(()=>assertExactCandidate(f.root,unrelated,f.commit),/not a descendant/);
 assert.doesNotThrow(()=>assertExactCandidate(f.root,descendant,f.commit));
});

test("frozen source ancestry requires a full exact baseline SHA",t=>{
 const f=fixture(t);
 for(const invalid of ["HEAD","main",f.commit.slice(0,12),"", "0".repeat(39), "G".repeat(40)])
  assert.throws(()=>assertExactCandidate(f.root,f.commit,invalid),/Frozen source must be an exact full Git commit SHA/);
 assert.doesNotThrow(()=>assertExactCandidate(f.root,f.commit,f.commit));
});

test("candidate ancestry rejects a missing frozen Git commit object",t=>{
 const f=fixture(t);
 assert.throws(()=>assertExactCandidate(f.root,f.commit,"0".repeat(40)),/Frozen source SHA is unavailable as a commit object/);
});
