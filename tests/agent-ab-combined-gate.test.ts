import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp,mkdir,readFile,rm,symlink,writeFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {basename,dirname,join} from "node:path";
import {tmpdir} from "node:os";
// @ts-expect-error Provider-free composite evidence gate intentionally remains ESM.
import {assembleAgentABAcceptance} from "../scripts/agent-ab-combined-gate.mjs";
// @ts-expect-error Pure no-receipt observation scaffold is ESM.
import {buildObservationScaffold} from "../scripts/agent-observable-scaffold.mjs";

const candidateSha="a".repeat(40),digest=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
async function fixture(t:import("node:test").TestContext){
 const root=await mkdtemp(join(tmpdir(),"asen-ab-composite-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const docs=structuredClone(buildObservationScaffold(candidateSha));
 return {root,candidateSha,...docs};
}
async function addReceipt(f:Awaited<ReturnType<typeof fixture>>,source:"A"|"B"|"ASEN",id="C01"){
 const entry=(source==="ASEN"?f.candidate:f.reference).cases.find((x:{id:string;source:string})=>x.id===id&&x.source===source);
 assert.ok(entry);
 entry.execution="real";
 entry.environment="isolated-mocked-claim";
 entry.model="none";
 const data=Buffer.from(JSON.stringify({
  schema:"asen-agent-observable-receipt-v1",id,source,sha:entry.sha,
  execution:"real",environment:entry.environment,model:entry.model,trace:entry.trace,
 }));
 const dir=join(f.root,"receipts",source);
 await mkdir(dir,{recursive:true});
 const path=join(dir,id+".json");
 await writeFile(path,data,{flag:"wx"});
 entry.receipt="receipts/"+source+"/"+id+".json#sha256="+digest(data);
 return path;
}
test("EF-701 20 planned scenarios stay BLOCKED with no actual A/B/ASEN receipts",
 {timeout:25000},async t=>{
 const data=await fixture(t);
 const result=await assembleAgentABAcceptance(data);
 assert.equal(result.totalCases,20);
 assert.equal(result.expectedSlots,60);
 assert.equal(result.integrityOnly,0);
 assert.equal(result.casesBlocked,20);
 assert.equal(result.failedIntegrityCases,0);
 assert.equal(result.sourceCasesExecutedAndAttested,0);
 assert.equal(result.globalFull,false);
 assert.equal(result.writerAuthorized,false);
 assert.deepEqual(result.rows.flatMap((r:{receipts:unknown[]})=>r.receipts).length,60);
 assert.deepEqual(result.rows.filter((r:{humanConsentRequired:boolean})=>r.humanConsentRequired)
  .map((r:{id:string})=>r.id),["C06","C07","C08","C18","C19","C20"]);
});
test("EF-701 digest-perfect matching A/B/ASEN receipts remain UNATTESTED and cannot grant Writer",
 {timeout:25000},async t=>{
 const f=await fixture(t);
 for(const side of ["A","B","ASEN"] as const)await addReceipt(f,side);
 const report=await assembleAgentABAcceptance(f);
 assert.equal(report.integrityOnly,3);
 assert.equal(report.claimedMatches,1);
 assert.equal(report.sourceCasesExecutedAndAttested,0);
 assert.equal(report.casesBlocked,20);
 assert.equal(report.rows[0].status,"BLOCKED");
 assert.equal(report.rows[0].reason,"MATCHED_BYTES_NOT_INDEPENDENTLY_ATTESTED");
 assert.equal(report.globalFull,false);
 assert.equal(report.writerAuthorized,false);
});
test("EF-701 tampered receipts or swapped reference identity cannot be passed off as a match",
 {timeout:25000},async t=>{
 const f=await fixture(t);
 const target=await addReceipt(f,"B");
 await addReceipt(f,"A");
 await addReceipt(f,"ASEN");
 await writeFile(target,JSON.stringify({schema:"tampered"}));
 let report=await assembleAgentABAcceptance(f);
 assert.equal(report.rows[0].status,"FAIL_INTEGRITY");
 assert.equal(report.rows[0].reason,"RECEIPT_INTEGRITY_FAILURE");
 assert.equal(report.globalFull,false);
 const b=f.reference.cases.find((x:{id:string;source:string})=>x.id==="C01"&&x.source==="B");
 b.sha="f".repeat(40);
 report=await assembleAgentABAcceptance(f);
 assert.equal(report.rows[0].status,"BLOCKED");
 assert.equal(report.rows[0].claim,"BLOCKED");
 assert.equal(report.globalFull,false);
});
test("EF-701 authentic-looking A/B disagreement is not promoted to verified parity or an independent finding",
 {timeout:25000},async t=>{
 const f=await fixture(t);
 const b=f.reference.cases.find((x:{id:string;source:string})=>x.id==="C11"&&x.source==="B");
 b.trace.guards=["writer:allowed"];
 for(const side of ["A","B","ASEN"] as const)await addReceipt(f,side,"C11");
 const result=await assembleAgentABAcceptance(f);
 assert.equal(result.claimedDifferences,1);
 assert.equal(result.rows[10].claim,"FAIL");
 assert.equal(result.rows[10].status,"BLOCKED");
 assert.equal(result.rows[10].reason,"REFERENCE_DIFFERENCE_NOT_INDEPENDENTLY_ATTESTED");
 assert.equal(result.globalFull,false);
});
test("EF-704 CLI produces create-only exact-SHA A/B evidence report without fabricating 60 runs",
 {timeout:25000},async t=>{
 const f=await fixture(t);
 const output=join(f.root,"combined.json");
 const env={...process.env,ASEN_EXPECTED_SHA:candidateSha,ASEN_AB_COMBINED_OUTPUT:output};
 const run=()=>spawnSync(process.execPath,["scripts/agent-ab-combined-gate.mjs"],{
  cwd:process.cwd(),env,encoding:"utf8",timeout:18000,windowsHide:true,
 });
 const first=run();
 assert.equal(first.status,0,first.stderr);
 assert.match(first.stdout,/EF701_AB_COMBINED_BLOCKED/u);
 const data=JSON.parse(await readFile(output,"utf8"));
 assert.equal(data.casesBlocked,20);
 assert.equal(data.integrityOnly,0);
 assert.equal(data.globalFull,false);
 const repeated=run();
 assert.notEqual(repeated.status,0,"A second run cannot overwrite an evidence file");
 assert.match(repeated.stderr,/EEXIST|file already exists/iu);
});

test("EF-701 refuses symlinked receipt root even if all supplied bytes match",
 {timeout:25000},async t=>{
 const f=await fixture(t);
 const link=join(dirname(f.root),"asen-ab-root-link-"+basename(f.root));
 try{
  await symlink(f.root,link,process.platform==="win32"?"junction":"dir");
 }catch(error){
  if(process.platform==="win32"&&(error as NodeJS.ErrnoException).code==="EPERM"){
   t.skip("Windows runner does not permit creating directory links");return;
  }
  throw error;
 }
 t.after(()=>rm(link,{force:true}));
 await assert.rejects(assembleAgentABAcceptance({...f,root:link}),/symbolic link/u);
 const ordinary=await assembleAgentABAcceptance(f);
 assert.equal(ordinary.globalFull,false);
 assert.equal(ordinary.casesBlocked,20);
});
