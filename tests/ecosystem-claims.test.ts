import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,symlinkSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {tmpdir} from "node:os";
import path from "node:path";
// @ts-expect-error Research/claims validator is deliberately outside the runtime TypeScript package.
import {isAllowedEcosystemOverlayPath,isEvidenceOnlyOverlay,loadEcosystemClaims,validateEcosystemClaims} from "../scripts/validate-ecosystem-claims.mjs";

const load=()=>loadEcosystemClaims();
const approvalPath=(id:string)=>`registry/parity/ecosystem-provenance-approvals/${id}.json`;
const envelope=(row:any,baseline:string)=>({
 schema:"asen.ecosystem-provenance-approval.v1",
 claim:{id:row.id,status:row.status},
 provenance:{testedCandidate:row.candidate,sourceBaseline:baseline,sourceSnapshot:row.sourceSnapshotCommit},
 approval:{candidate:row.candidate,humanVerification:{reviewerType:"HUMAN",independence:"DECLARED_INDEPENDENT",authentication:"UNAUTHENTICATED_DECLARATION",method:"MANUAL_INDEPENDENT_VERIFICATION",reviewer:"Independent reviewer",notes:"Manually compared the declared candidate and evidence.",verifiedAt:"2026-10-14T12:34:56.789Z"}},
 constraints:{claimsPromotion:false,cryptographicAttestation:false,deliveryAuthority:false},
});
const attachApproval=(input:any,row:any,value:any=envelope(row,input.baseline.commit),raw?:Buffer)=>{
 const dir=mkdtempSync(path.join(tmpdir(),"ecosystem-approval-")),filename=path.join(dir,`${row.id}.json`);
 const bytes=raw??Buffer.from(JSON.stringify(value),"utf8");writeFileSync(filename,bytes);
 const reference={path:approvalPath(row.id),sha256:createHash("sha256").update(bytes).digest("hex")};row.provenanceApproval=reference;
 input.approvalRecords=new Map([[reference.path,{bytes,document:value}]]);return {reference,value,bytes};
};
const approvalIssues=(input:any)=>validateEcosystemClaims(input).filter((issue:string)=>issue.includes("EPA"));
const loaderFixture=(reference:any,setup?:(root:string)=>void)=>{
 const root=mkdtempSync(path.join(tmpdir(),"ecosystem-approval-loader-")),parity=path.join(root,"registry","parity");mkdirSync(parity,{recursive:true});
 for(const name of ["ecosystem-sources-v1.json","ecosystem-claims-v1.json","ecosystem-reference-adjudications-v1.json","ecosystem-runtime-edge-mappings-v1.json"])
  copyFileSync(path.join("registry","parity",name),path.join(parity,name));
 const claimsPath=path.join(parity,"ecosystem-claims-v1.json"),registry=JSON.parse(readFileSync(claimsPath,"utf8"));registry.rows[0].provenanceApproval=reference;writeFileSync(claimsPath,JSON.stringify(registry));setup?.(root);
 execFileSync("git",["init","--quiet",root]);execFileSync("git",["-C",root,"config","user.email","fixture@example.invalid"]);execFileSync("git",["-C",root,"config","user.name","Fixture"]);execFileSync("git",["-C",root,"add","registry"]);execFileSync("git",["-C",root,"commit","--quiet","-m","fixture"]);
 return loadEcosystemClaims(root);
};
test("FULL cannot lower fixed ECO obligations through editable claim flags",()=>{
  const input=load(),row=input.registry.rows.find((r:any)=>r.id==="ECO-05");
  row.status="FULL";row.remaining=[];row.candidate=input.observedHead;
  for(const flag of ["stateful","platformSensitive","piBoundary","modelBoundary"])row[flag]=false;
  row.evidence=["positive","negative","failure","recovery"].map(kind=>{
    const proof={id:kind,kind,result:"PASS",class:"DETERMINISTIC_EXECUTION",candidate:row.candidate,sourceCommit:input.baseline.commit,command:"tests",observation:"declared",recordPath:`registry/evidence/ecosystem/${kind}.json`,recordSha256:"a".repeat(64)};
    input.existingPaths.add(proof.recordPath);input.recordDigests.set(proof.recordPath,proof.recordSha256);input.records.set(proof.recordPath,proof);return proof;
  });
  const issues=validateEcosystemClaims(input).join("\n");
  for(const kind of ["restart","cross-session","linux","windows","macos","pi-host","pi-model"])assert.match(issues,new RegExp("missing "+kind));
});
test("every current ECO claim is honest and no row silently claims FULL",()=>{
  const input=load();assert.deepEqual(validateEcosystemClaims(input),[]);
  assert.equal(input.registry.rows.length,16);
  assert.equal(input.registry.rows.some((row:any)=>row.status==="FULL"),false);
});
test("evidence may follow its tested candidate only as claim and receipt metadata",()=>{
 assert.equal(isEvidenceOnlyOverlay(["registry/parity/ecosystem-claims-v1.json","registry/evidence/ecosystem/eco-05-positive.json"]),true);
 assert.equal(isEvidenceOnlyOverlay([]),false);
 assert.equal(isEvidenceOnlyOverlay(["src/agents/dispatcher.ts"]),false);
 assert.equal(isEvidenceOnlyOverlay(["registry/evidence/ecosystem/../private.json"]),false);
 assert.equal(isEvidenceOnlyOverlay(["registry/evidence/ecosystem/one.json","registry/evidence/ecosystem/one.json"]),false);
});
test("FULL binds receipts to an exact tested source commit followed by an evidence-only overlay",()=>{
 const baseline=JSON.parse(readFileSync("registry/parity/ecosystem-sources-v1.json","utf8")),registry=JSON.parse(readFileSync("registry/parity/ecosystem-claims-v1.json","utf8"));
 const input:any={baseline,registry,observedHead:"c".repeat(40),driftReport:undefined,existingPaths:new Set(registry.rows.flatMap((r:any)=>[...r.implementation,...r.tests])),recordDigests:new Map(),records:new Map(),candidateOverlays:new Map()};
 const row=input.registry.rows.find((r:any)=>r.id==="ECO-05"),candidate="a".repeat(40),sourceCandidate="b".repeat(40);
 row.status="FULL";row.remaining=[];row.candidate=candidate;row.sourceSnapshotCommit=sourceCandidate;
 input.candidateOverlays=new Map([[candidate,true]]);
 input.driftReport={from:input.baseline.commit,to:sourceCandidate,autoAdopt:false,changes:[],invalidatedPaths:[]};
 const classes:Record<string,string>={positive:"DETERMINISTIC_EXECUTION",negative:"DETERMINISTIC_EXECUTION",failure:"DETERMINISTIC_EXECUTION",recovery:"DETERMINISTIC_EXECUTION",restart:"DETERMINISTIC_EXECUTION","cross-session":"DETERMINISTIC_EXECUTION",linux:"OS_RUNTIME",windows:"OS_RUNTIME",macos:"OS_RUNTIME","pi-host":"REAL_PI_HOST","pi-model":"REAL_PI_MODEL"};
 row.evidence=Object.entries(classes).map(([kind,evidenceClass])=>{
  const recordPath=`registry/evidence/ecosystem/validator-${kind}.json`,receipt={id:`receipt-${kind}`,candidate,sourceCommit:input.baseline.commit,kind,class:evidenceClass,command:"exact verified command",observation:"exact observed result",result:"PASS"};
  const recordSha256=createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
  const proof={...receipt,recordPath,recordSha256};input.existingPaths.add(recordPath);input.recordDigests.set(recordPath,recordSha256);input.records.set(recordPath,receipt);return proof;
 });
 attachApproval(input,row);
 assert.deepEqual(validateEcosystemClaims(input),[]);
 input.candidateOverlays.set(candidate,false);
 assert.match(validateEcosystemClaims(input).join("\n"),/tested source candidate followed only by claim\/evidence metadata/);
});
test("provenance approval references are required for FULL and optional for PARTIAL",()=>{
 const input:any=load(),row=input.registry.rows[0];assert.deepEqual(approvalIssues(input),[]);
 row.status="FULL";assert.deepEqual(approvalIssues(input),[`${row.id}: EPA001_REFERENCE_REQUIRED`]);
});

test("provenance approval references fail closed for unsafe, malformed, missing, and digest-mismatched files",()=>{
 const cases:[string,(input:any,row:any)=>void][]=[
  ["EPA002_REFERENCE_INVALID",(_input,row)=>{row.provenanceApproval={path:"registry/parity/ecosystem-provenance-approvals/../escape.json",sha256:"a".repeat(64)};}],
  ["EPA002_REFERENCE_INVALID",(_input,row)=>{row.provenanceApproval={sha256:"a".repeat(64),path:approvalPath(row.id)};}],
  ["EPA003_REFERENCE_MISSING",(_input,row)=>{row.provenanceApproval={path:approvalPath(row.id),sha256:"a".repeat(64)};}],
  ["EPA002_REFERENCE_INVALID",(input,row)=>{const fixture=attachApproval(input,row);input.approvalRecords.set(fixture.reference.path,{unsafe:true});}],
  ["EPA004_DIGEST_MISMATCH",(input,row)=>{const fixture=attachApproval(input,row);input.approvalRecords.set(fixture.reference.path,{bytes:Buffer.concat([fixture.bytes.subarray(0,-1),Buffer.from(" ")]),document:fixture.value});}],
 ];
 for(const [code,mutate] of cases){const input:any=load(),row=input.registry.rows[0];mutate(input,row);assert.match(approvalIssues(input).join("\n"),new RegExp(code));}
});

test("raw approval JSON rejects duplicate members at every object depth and malformed JSON",()=>{
 const input:any=load(),row=input.registry.rows[0];row.candidate="a".repeat(40);row.sourceSnapshotCommit="b".repeat(40);const raw=JSON.stringify(envelope(row,input.baseline.commit));
 const duplicates:Array<[string,string]>=[
  [`"schema":"asen.ecosystem-provenance-approval.v1"`,`"schema":"asen.ecosystem-provenance-approval.v1","schema":"asen.ecosystem-provenance-approval.v1"`],
  [`"claim":{"id":"${row.id}"`,`"claim":{"id":"${row.id}","id":"${row.id}"`],
  [`"provenance":{"testedCandidate":"${row.candidate}"`,`"provenance":{"testedCandidate":"${row.candidate}","testedCandidate":"${row.candidate}"`],
  [`"approval":{"candidate":"${row.candidate}"`,`"approval":{"candidate":"${row.candidate}","candidate":"${row.candidate}"`],
  [`"humanVerification":{"reviewerType":"HUMAN"`,`"humanVerification":{"reviewerType":"HUMAN","reviewerType":"HUMAN"`],
  [`"constraints":{"claimsPromotion":false`,`"constraints":{"claimsPromotion":false,"claimsPromotion":false`],
 ];
 for(const [needle,replacement] of duplicates){const fixture:any=load(),fixtureRow=fixture.registry.rows[0];fixtureRow.candidate=row.candidate;fixtureRow.sourceSnapshotCommit=row.sourceSnapshotCommit;attachApproval(fixture,fixtureRow,undefined,Buffer.from(raw.replace(needle,replacement)));assert.deepEqual(approvalIssues(fixture),[`${fixtureRow.id}: EPA006_SHAPE_INVALID`]);}
 const malformed:any=load(),malformedRow=malformed.registry.rows[0];attachApproval(malformed,malformedRow,undefined,Buffer.from('{"schema":'));assert.deepEqual(approvalIssues(malformed),[`${malformedRow.id}: EPA006_SHAPE_INVALID`]);
 const precedence:any=load(),precedenceRow=precedence.registry.rows[0],[duplicateNeedle,duplicateReplacement]=duplicates[0]!;precedenceRow.status="MISSING";precedenceRow.candidate="a".repeat(40);precedenceRow.sourceSnapshotCommit="b".repeat(40);const precedenceRaw=JSON.stringify(envelope(precedenceRow,precedence.baseline.commit)).replace(duplicateNeedle,duplicateReplacement);attachApproval(precedence,precedenceRow,undefined,Buffer.from(precedenceRaw));precedenceRow.provenanceApproval.sha256="0".repeat(64);assert.deepEqual(approvalIssues(precedence),[`${precedenceRow.id}: EPA004_DIGEST_MISMATCH`,`${precedenceRow.id}: EPA006_SHAPE_INVALID`,`${precedenceRow.id}: EPA011_STATUS_NOT_ELIGIBLE`]);
});

test("approval JSON rejects unpaired surrogate scalars in governed keys and values but accepts valid pairs",()=>{
 const valueMutations=[
  (value:any)=>{value.schema+="\ud800";},(value:any)=>{value.claim.id+="\ud800";},(value:any)=>{value.claim.status+="\udc00";},
  (value:any)=>{value.provenance.testedCandidate+="\ud800";},(value:any)=>{value.provenance.sourceBaseline+="\ud800";},(value:any)=>{value.provenance.sourceSnapshot+="\ud800";},
  (value:any)=>{value.approval.candidate+="\ud800";},(value:any)=>{value.approval.humanVerification.reviewerType+="\ud800";},
  (value:any)=>{value.approval.humanVerification.independence+="\ud800";},(value:any)=>{value.approval.humanVerification.authentication+="\ud800";},
  (value:any)=>{value.approval.humanVerification.method+="\ud800";},(value:any)=>{value.approval.humanVerification.reviewer+="\ud800";},
  (value:any)=>{value.approval.humanVerification.notes+="\udc00";},(value:any)=>{value.approval.humanVerification.verifiedAt+="\ud800";},
 ];
 for(const mutate of valueMutations){const input:any=load(),row=input.registry.rows[0];row.candidate="a".repeat(40);row.sourceSnapshotCommit="b".repeat(40);const value:any=envelope(row,input.baseline.commit);mutate(value);attachApproval(input,row,value);assert.deepEqual(approvalIssues(input),[`${row.id}: EPA006_SHAPE_INVALID`]);}
 const keyNeedles=["schema","id","testedCandidate","candidate","reviewerType","claimsPromotion"];
 for(const key of keyNeedles){const input:any=load(),row=input.registry.rows[0];row.candidate="a".repeat(40);row.sourceSnapshotCommit="b".repeat(40);const raw=JSON.stringify(envelope(row,input.baseline.commit)).replace(`\"${key}\"`,`\"${key}\\ud800\"`);attachApproval(input,row,undefined,Buffer.from(raw));assert.deepEqual(approvalIssues(input),[`${row.id}: EPA006_SHAPE_INVALID`]);}
 const valid:any=load(),validRow=valid.registry.rows[0];validRow.candidate="a".repeat(40);validRow.sourceSnapshotCommit="b".repeat(40);const value:any=envelope(validRow,valid.baseline.commit);value.approval.humanVerification.reviewer="Reviewer 😀";attachApproval(valid,validRow,value);assert.deepEqual(approvalIssues(valid),[]);
});

test("provenance approval envelope enforces bytes, exact ordered shapes, schema, SHAs, and timestamp",()=>{
 const mutations:[string,(value:any)=>void][]=[
  ["EPA005_SIZE_INVALID",value=>{value.approval.humanVerification.notes="x".repeat(17_000);}],
  ["EPA006_SHAPE_INVALID",value=>{value.extra=false;}],
  ["EPA006_SHAPE_INVALID",value=>{value.claim={status:value.claim.status,id:value.claim.id};}],
  ["EPA006_SHAPE_INVALID",value=>{value.schema="asen.ecosystem-provenance-approval.v2";}],
  ["EPA006_SHAPE_INVALID",value=>{value.provenance.testedCandidate="A".repeat(40);}],
  ["EPA006_SHAPE_INVALID",value=>{value.approval.humanVerification.verifiedAt="2026-10-14T12:34:56Z";}],
 ];
 for(const [code,mutate] of mutations){const input:any=load(),row=input.registry.rows[0];row.candidate="a".repeat(40);row.sourceSnapshotCommit="b".repeat(40);const value=envelope(row,input.baseline.commit);mutate(value);attachApproval(input,row,value);assert.match(approvalIssues(input).join("\n"),new RegExp(code));}
});

test("provenance approval envelope binds claim, provenance, approval candidate, and non-authority constraints",()=>{
 const mutations:[string,(value:any)=>void][]=[
  ["EPA007_CLAIM_MISMATCH",value=>{value.claim.id="ECO-16";}],
  ["EPA008_PROVENANCE_MISMATCH",value=>{value.provenance.sourceBaseline="b".repeat(40);}],
  ["EPA009_APPROVAL_MISMATCH",value=>{value.approval.candidate="b".repeat(40);}],
  ["EPA010_DECLARATION_INVALID",value=>{value.constraints.claimsPromotion=true;}],
  ["EPA010_DECLARATION_INVALID",value=>{value.constraints.cryptographicAttestation=true;}],
  ["EPA010_DECLARATION_INVALID",value=>{value.constraints.deliveryAuthority=true;}],
 ];
 for(const [code,mutate] of mutations){const input:any=load(),row=input.registry.rows[0];row.candidate="a".repeat(40);row.sourceSnapshotCommit="b".repeat(40);const value=envelope(row,input.baseline.commit);mutate(value);attachApproval(input,row,value);assert.match(approvalIssues(input).join("\n"),new RegExp(code));}
});

test("human verification declaration is fixed, bounded, normalized, control-free, and descriptive",()=>{
 const mutations=((human:any)=>[
  ()=>{human.reviewerType="BOT";},()=>{human.independence="INDEPENDENT";},()=>{human.authentication="AUTHENTICATED";},()=>{human.method="AUTOMATED";},
  ()=>{human.reviewer=" reviewer ";},()=>{human.reviewer="e\u0301";},()=>{human.notes="bad\u202Etext";},()=>{human.notes="";},
 ]) as any;
 for(let index=0;index<8;index++){const input:any=load(),row=input.registry.rows[0];row.candidate="a".repeat(40);row.sourceSnapshotCommit="b".repeat(40);const value=envelope(row,input.baseline.commit);mutations(value.approval.humanVerification)[index]();attachApproval(input,row,value);assert.match(approvalIssues(input).join("\n"),/EPA010_DECLARATION_INVALID/);}
});

test("PARTIAL accepts a valid envelope, ineligible statuses reject it, and FULL reaches existing evidence gates",()=>{
 const partial:any=load(),partialRow=partial.registry.rows[0];partialRow.candidate="a".repeat(40);partialRow.sourceSnapshotCommit="b".repeat(40);attachApproval(partial,partialRow);assert.deepEqual(approvalIssues(partial),[]);
 for(const status of ["MISSING","OUT-OF-SCOPE"]){const input:any=load(),row=input.registry.rows[0];row.status=status;row.candidate="a".repeat(40);row.sourceSnapshotCommit="b".repeat(40);if(status==="OUT-OF-SCOPE")row.difference="branding";attachApproval(input,row);assert.match(approvalIssues(input).join("\n"),/EPA011_STATUS_NOT_ELIGIBLE/);}
  const full:any=load(),fullRow=full.registry.rows[0];fullRow.status="FULL";fullRow.candidate="a".repeat(40);fullRow.sourceSnapshotCommit="b".repeat(40);fullRow.remaining=[];attachApproval(full,fullRow);const issues=validateEcosystemClaims(full).join("\n");assert.doesNotMatch(issues,/EPA/);assert.match(issues,/FULL must name the exact tested source candidate/);assert.match(issues,/missing positive evidence/);
});

test("approval error codes remain deterministic in row order then invariant order",()=>{
 const input:any=load(),first=input.registry.rows[0],second=input.registry.rows[1];first.status="MISSING";first.provenanceApproval={sha256:"a".repeat(64),path:approvalPath(first.id)};second.status="FULL";
 assert.deepEqual(approvalIssues(input),[`${first.id}: EPA002_REFERENCE_INVALID`,`${first.id}: EPA011_STATUS_NOT_ELIGIBLE`,`${second.id}: EPA001_REFERENCE_REQUIRED`]);
});

test("loader rejects absolute and traversal references before filesystem admission",()=>{
 for(const unsafe of [path.resolve("outside-approval.json"),"registry/parity/ecosystem-provenance-approvals/../ECO-01.json"]){const input:any=loaderFixture({path:unsafe,sha256:"a".repeat(64)});assert.deepEqual(approvalIssues(input),["ECO-01: EPA002_REFERENCE_INVALID"]);}
});

test("loader marks a symlink escape unsafe and reports its deterministic diagnostic",t=>{
 const bytes=Buffer.from("{}"),reference={path:approvalPath("ECO-01"),sha256:createHash("sha256").update(bytes).digest("hex")};let denied:any;
 let input:any;try{input=loaderFixture(reference,root=>{const outside=path.join(path.dirname(root),`${path.basename(root)}-outside.json`),target=path.join(root,reference.path);writeFileSync(outside,bytes);mkdirSync(path.dirname(target),{recursive:true});symlinkSync(outside,target,"file");});}catch(error:any){if(["EPERM","EACCES","ENOTSUP","UNKNOWN_PRIVILEGE"].includes(error?.code)){denied=error;}else throw error;}
 if(denied){t.skip(`platform denied symlink creation: ${denied.code}`);return;}
 assert.deepEqual(input.approvalRecords.get(reference.path),{unsafe:true});assert.deepEqual(approvalIssues(input),["ECO-01: EPA002_REFERENCE_INVALID"]);
});

test("approval metadata is an evidence-only overlay without widening unrelated paths",()=>{
 assert.equal(isAllowedEcosystemOverlayPath(approvalPath("ECO-01")),true);
 assert.equal(isAllowedEcosystemOverlayPath(approvalPath("ECO-99")),false);
 assert.equal(isEvidenceOnlyOverlay([approvalPath("ECO-01")]),true);
 assert.equal(isEvidenceOnlyOverlay([approvalPath("ECO-99")]),false);
 assert.equal(isEvidenceOnlyOverlay([approvalPath("eco-01")]),false);
 assert.equal(isEvidenceOnlyOverlay(["registry/parity/ecosystem-provenance-approvals/ECO-01.json/extra"]),false);
 assert.equal(isEvidenceOnlyOverlay([approvalPath("ECO-01"),"docs/unrelated.md"]),false);
});

test("candidate report integration passes the supplied root metadata to the verifier before producing drift state",()=>{
 const baselineCommit=load().baseline.commit;
 const previousRepository=process.env.ECOSYSTEM_SOURCE_REPOSITORY,previousCandidate=process.env.ECOSYSTEM_SOURCE_CANDIDATE,previousReport=process.env.ECOSYSTEM_CANDIDATE_REPORT;
 process.env.ECOSYSTEM_SOURCE_REPOSITORY=process.cwd();delete process.env.ECOSYSTEM_SOURCE_CANDIDATE;
 process.env.ECOSYSTEM_CANDIDATE_REPORT="registry/parity/ecosystem-claims-v1.json";
 let received:any;
 try{
  const input=loadEcosystemClaims(process.cwd(),{verifyCandidateReport:(repository:string,report:any,metadata:any)=>{
   received={repository,report,metadata};return {inputs:{baselineCommit, candidateCommit:"a".repeat(40)},changes:[],invalidatedPaths:[]};
  }});
  assert.equal(received.repository,process.cwd());assert.equal(received.metadata.baselineBytes.toString("utf8").includes(baselineCommit),true);
  assert.equal(received.metadata.claimsBytes.toString("utf8").includes('"ECO-01"'),true);
  assert.equal(input.driftReport.to,"a".repeat(40));
 }finally{
  if(previousRepository===undefined)delete process.env.ECOSYSTEM_SOURCE_REPOSITORY;else process.env.ECOSYSTEM_SOURCE_REPOSITORY=previousRepository;
  if(previousCandidate===undefined)delete process.env.ECOSYSTEM_SOURCE_CANDIDATE;else process.env.ECOSYSTEM_SOURCE_CANDIDATE=previousCandidate;
  if(previousReport===undefined)delete process.env.ECOSYSTEM_CANDIDATE_REPORT;else process.env.ECOSYSTEM_CANDIDATE_REPORT=previousReport;
 }
});
test("rejects omitted/duplicated units, unknown sources, missing implementation and undocumented gaps",()=>{
  for(const mutate of [
    (x:any)=>{x.registry.rows.pop();},(x:any)=>{x.registry.rows[1].id=x.registry.rows[0].id;},
    (x:any)=>{x.registry.rows[0].sourceHashes=["a".repeat(64)];},
    (x:any)=>{x.registry.rows[0].implementation=["../private"];},
    (x:any)=>{x.registry.rows[0].remaining=[];},
    (x:any)=>{x.registry.rows[0].stateful=undefined;},
    (x:any)=>{x.registry.rows[0].status="OUT-OF-SCOPE";x.registry.rows[0].difference="too much work";},
  ]) {const input=load();mutate(input);assert.ok(validateEcosystemClaims(input).length);}
});
test("FULL rejects file presence, unchecked fixtures, stale candidates and absent behavior evidence",()=>{
  for(const mutate of [
    (_row:any)=>{},(row:any)=>{row.candidate="a".repeat(40);row.remaining=[];},
    (row:any)=>{row.remaining=[];row.evidence=[{id:"fixture",result:"PASS",class:"FILE_PRESENT",kind:"pi-host"}];},
  ]) {const input=load(),row=input.registry.rows[0];row.status="FULL";mutate(row);assert.ok(validateEcosystemClaims(input).length);}
});
test("FULL requires every platform, restart, cross-session and real Pi boundary; receipts bind bytes",()=>{
  const input=load(),row=input.registry.rows.find((r:any)=>r.id==="ECO-05");
  row.status="FULL";row.remaining=[];row.candidate=input.observedHead;
  row.evidence=[{id:"forged",kind:"positive",result:"PASS",class:"DETERMINISTIC_EXECUTION",candidate:row.candidate,
    sourceCommit:input.baseline.commit,command:"tests",observation:"declared",recordPath:"tests/dispatcher.test.ts",recordSha256:"a".repeat(64)}];
  const issues=validateEcosystemClaims(input).join("\n");
  for(const kind of ["negative","failure","recovery","restart","cross-session","linux","windows","macos","pi-host","pi-model"])
    assert.match(issues,new RegExp("missing "+kind));
  assert.match(issues,/tested source candidate followed only by claim\/evidence metadata/);
  assert.match(issues,/invalid executed evidence record/);assert.match(issues,/receipt\/content binding/);
  const path=input.baseline.files.find((r:any)=>r.sha256===row.sourceHashes[0]).path;
  input.driftReport={from:input.baseline.commit,to:row.sourceSnapshotCommit,autoAdopt:false,changes:[],invalidatedPaths:[path]};
  assert.match(validateEcosystemClaims(input).join("\n"),/drift invalidates FULL/);
});

test("FULL fails closed without a drift report bound to its exact frozen source candidate",()=>{
 const input=load(),row=input.registry.rows.find((r:any)=>r.id==="ECO-05");
 row.status="FULL";row.candidate=input.observedHead;row.sourceSnapshotCommit=input.baseline.commit;row.remaining=[];
 assert.match(validateEcosystemClaims(input).join("\n"),/exact baseline-to-source-candidate drift report/);
 input.driftReport={from:input.baseline.commit,to:"a".repeat(40),autoAdopt:false,changes:[],invalidatedPaths:[]};
 assert.match(validateEcosystemClaims(input).join("\n"),/exact baseline-to-source-candidate drift report/);
 input.driftReport={from:input.baseline.commit,to:row.sourceSnapshotCommit,autoAdopt:true,changes:[],invalidatedPaths:[]};
 assert.match(validateEcosystemClaims(input).join("\n"),/exact baseline-to-source-candidate drift report/);
});

test("a duplicate frozen-source hash invalidates FULL when any matching path drifts",()=>{
 const input=load(),row=input.registry.rows.find((r:any)=>r.id==="ECO-05");
 const first=input.baseline.files[0],second=input.baseline.files[1];second.sha256=first.sha256;
 row.status="FULL";row.candidate=input.observedHead;row.sourceSnapshotCommit=input.baseline.commit;row.sourceHashes=[first.sha256];row.remaining=[];
 input.driftReport={from:input.baseline.commit,to:row.sourceSnapshotCommit,autoAdopt:false,changes:[],invalidatedPaths:[second.path]};
 assert.match(validateEcosystemClaims(input).join("\n"),/source drift invalidates FULL/);
});

test("an unmapped added source conservatively invalidates any prospective FULL row",()=>{
 const input=load(),row=input.registry.rows.find((r:any)=>r.id==="ECO-05");
 row.status="FULL";row.candidate=input.observedHead;row.sourceSnapshotCommit=input.baseline.commit;row.remaining=[];
 input.driftReport={from:input.baseline.commit,to:row.sourceSnapshotCommit,autoAdopt:false,
  changes:[{kind:"ADDED",path:"new-unmapped-source.ts"}],invalidatedPaths:["new-unmapped-source.ts"]};
 assert.match(validateEcosystemClaims(input).join("\n"),/source drift invalidates FULL/);
});
