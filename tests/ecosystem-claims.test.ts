import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Research/claims validator is deliberately outside the runtime TypeScript package.
import {loadEcosystemClaims,validateEcosystemClaims} from "../scripts/validate-ecosystem-claims.mjs";

const load=()=>loadEcosystemClaims();
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
  input.invalidatedPaths=[path];assert.match(validateEcosystemClaims(input).join("\n"),/drift invalidates FULL/);
});
