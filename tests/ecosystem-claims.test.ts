import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
// @ts-expect-error Research/claims validator is deliberately outside the runtime TypeScript package.
import {isEvidenceOnlyOverlay,loadEcosystemClaims,validateEcosystemClaims} from "../scripts/validate-ecosystem-claims.mjs";

const load=()=>loadEcosystemClaims();
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
 assert.deepEqual(validateEcosystemClaims(input),[]);
 input.candidateOverlays.set(candidate,false);
 assert.match(validateEcosystemClaims(input).join("\n"),/tested source candidate followed only by claim\/evidence metadata/);
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
    (row:any)=>{},(row:any)=>{row.candidate="a".repeat(40);row.remaining=[];},
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
