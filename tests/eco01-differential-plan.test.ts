import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
// @ts-expect-error Research-only executable script outside the typed runtime package.
import {createDifferentialPlan,assessPairedObservation,createExecutionReceipt,verifyFrozenSourceCheckout} from "../scripts/eco01-differential-plan.mjs";

const hash=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");

const asenCommit="b".repeat(40);
function execute(contractId:string,scenario:string,commit:string,value:unknown){
 const source=`process.stdout.write(${JSON.stringify(JSON.stringify(value))})`;
 const run=spawnSync(process.execPath,["-e",source],{encoding:"utf8",cwd:process.cwd()});
 assert.equal(run.status,0,run.stderr);
 return createExecutionReceipt({contractId,scenario,commit,command:{executable:process.execPath,args:["-e",source]},environment:{platform:process.platform,nodeVersion:process.version,cwd:process.cwd()},exitCode:run.status??1,stdout:run.stdout,stderr:run.stderr,output:JSON.parse(run.stdout)});
}

test("ECO-01 binds all 25 inventory edges to source paths and exact spans without asserting parity",()=>{
 const plan=createDifferentialPlan();
 assert.equal(plan.schema,"asen.eco01.differential-plan.v2");
 assert.equal(plan.contracts.length,25);
 assert.equal(new Set(plan.contracts.map((c:any)=>c.id)).size,25);
 assert.equal(plan.contracts.filter((c:any)=>c.kind==="code-contract").length,12);
 assert.equal(plan.contracts.filter((c:any)=>c.kind==="external-runtime").length,10);
 assert.equal(plan.contracts.filter((c:any)=>c.kind.startsWith("tracked-")).length,3);
 assert.ok(plan.contracts.every((c:any)=>c.sourcePath&&c.sourceSpan.startLine>0&&c.sourceSpan.endLine>=c.sourceSpan.startLine&&c.scenarios.length>=4&&c.scenarios.every((s:any)=>s.status==="UNVERIFIED"&&s.evidence===null)));
});

test("ECO-01 verifies a clean frozen Git checkout, file bytes, and mapped source spans",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-eco01-source-"));
 try{
  mkdirSync(join(root,"src"));const bytes=Buffer.from("export const behavior = true;\n");writeFileSync(join(root,"src","behavior.ts"),bytes);
  execFileSync("git",["init","--quiet",root]);execFileSync("git",["-C",root,"config","user.name","ECO-01 test"]);execFileSync("git",["-C",root,"config","user.email","eco01-test@example.invalid"]);execFileSync("git",["-C",root,"add","src/behavior.ts"]);execFileSync("git",["-C",root,"commit","--quiet","-m","frozen fixture"]);
  const commit=execFileSync("git",["-C",root,"rev-parse","HEAD"],{encoding:"utf8"}).trim(),fileSha=hash(bytes),spanSha=hash(bytes);
  const baseline={commit,files:[{id:"source-1",path:"src/behavior.ts",objectId:"blob-1",sha256:fileSha,bytes:bytes.byteLength,references:[{kind:"tool",target:null,status:"unresolved",path:null}]}]};
  const mapping={baselineCommit:commit,mappings:[{sourceId:"source-1",referenceIndex:0,objectId:"blob-1",sha256:fileSha,bytes:bytes.byteLength,span:{startLine:1,endLine:1,sha256:spanSha},mappingKind:"code-contract",mappingReason:"fixture",targets:["source-1"]}]};
  assert.deepEqual(verifyFrozenSourceCheckout(baseline,mapping,root),{commit,clean:true,verifiedFiles:1,verifiedEdges:1});
  assert.equal(createDifferentialPlan(baseline,mapping,root).sourceVerification.verifiedEdges,1);
  writeFileSync(join(root,"src","behavior.ts"),"export const behavior = false;\n");
  assert.throws(()=>verifyFrozenSourceCheckout(baseline,mapping,root),/exact and clean/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("ECO-01 accepts only output and log hashes recomputed from exact paired execution receipts",()=>{
 const plan=createDifferentialPlan(),contract=plan.contracts[0],scenario=contract.scenarios.find((s:any)=>s.name==="available")!.name;
 const sourceReceipt=execute(contract.id,scenario,plan.baselineCommit,{ok:true,value:"same"});
 const asenReceipt=execute(contract.id,scenario,asenCommit,{ok:true,value:"same"});
 const valid={contractId:contract.id,scenario,status:"EQUIVALENT",asenCommit,sourceReceipt,asenReceipt,difference:{summary:"No observable output or exit difference"},limitations:[]};
 const assessed=assessPairedObservation(plan,valid);
 assert.equal(assessed.observationValid,true);
 assert.equal(assessed.admitted,false);
 assert.throws(()=>assessPairedObservation(plan,{...valid,sourceReceipt:{...sourceReceipt,logSha256:"a".repeat(64)}}),/hash mismatch/);
 assert.throws(()=>assessPairedObservation(plan,{...valid,sourceReceipt:{...sourceReceipt,commit:"c".repeat(40)}}),/bound to exact commits/);
 assert.throws(()=>assessPairedObservation(plan,{...valid,asenCommit:"not-a-sha"}),/Exact ASEN SHA/);
 assert.throws(()=>assessPairedObservation(plan,{...valid,asenReceipt:execute(contract.id,"invalid-input",asenCommit,{ok:true,value:"same"})}),/bound to exact commits and scenarios/);
 const differentLog=createExecutionReceipt({...asenReceipt,stderr:"provider warning\n"});
 assert.throws(()=>assessPairedObservation(plan,{...valid,asenReceipt:differentLog}),/contradicts/);
});

test("ECO-01 requires demonstrated differences for DIVERGENT and INTENTIONAL",()=>{
 const plan=createDifferentialPlan(),contract=plan.contracts.find((c:any)=>c.kind==="code-contract")!,scenario=contract.scenarios[0]!.name;
 const sourceReceipt=execute(contract.id,scenario,plan.baselineCommit,{value:"source"}),asenReceipt=execute(contract.id,scenario,asenCommit,{value:"asen"});
 const base={contractId:contract.id,scenario,asenCommit,sourceReceipt,asenReceipt,difference:{summary:"Output value differs"},limitations:[]};
 assert.equal(assessPairedObservation(plan,{...base,status:"DIVERGENT"}).observationValid,true);
 assert.throws(()=>assessPairedObservation(plan,{...base,status:"INTENTIONAL"}),/contract-specific rationale/);
 assert.equal(assessPairedObservation(plan,{...base,status:"INTENTIONAL",reason:"ASEN deliberately scopes this workflow to its own repository model."}).observationValid,true);
 assert.throws(()=>assessPairedObservation(plan,{...base,status:"EQUIVALENT"}),/contradicts/);
});

test("ECO-01 preserves UNVERIFIED and requires a specific reason for NOT_APPLICABLE",()=>{
 const plan=createDifferentialPlan(),external=plan.contracts.find((c:any)=>c.kind==="external-runtime")!,scenario=external.scenarios[0]!.name;
 assert.deepEqual(assessPairedObservation(plan,{contractId:external.id,scenario,status:"UNVERIFIED"}),{contractId:external.id,scenario,status:"UNVERIFIED",observationValid:false,admitted:false});
 assert.throws(()=>assessPairedObservation(plan,{contractId:external.id,scenario,status:"NOT_APPLICABLE",reason:"external"}),/contract-specific/);
 assert.equal(assessPairedObservation(plan,{contractId:external.id,scenario,status:"NOT_APPLICABLE",reason:"External binary installation is not part of ASEN's supported runtime scope."}).observationValid,true);
 const code=plan.contracts.find((c:any)=>c.kind==="code-contract")!;
 assert.equal(assessPairedObservation(plan,{contractId:code.id,scenario:code.scenarios[0]!.name,status:"NOT_APPLICABLE",reason:"ASEN does not adopt this source-owned registration surface."}).observationValid,true);
});
