import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Research/claims validator is deliberately outside the runtime TypeScript package.
import {loadEcosystemClaims,validateEcosystemClaims} from "../scripts/validate-ecosystem-claims.mjs";

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
