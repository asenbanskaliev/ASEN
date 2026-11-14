import test from "node:test";
import assert from "node:assert/strict";
import {buildAgentABCaseReadiness} from "../scripts/agent-ab-case-readiness.mjs";
import {pinnedAgentABSources} from "../scripts/agent-ab-source-witness.mjs";
import {FIRST_FIVE,FIRST_FIVE_FIXTURE,fingerprintFirstFiveFixture,
 buildR4FirstFivePreflight} from "../scripts/r4-first-five-preflight.mjs";

const sha="a".repeat(40);
function hostSmoke(){
 const pinned=pinnedAgentABSources();
 return {schema:"asen-ab-native-host-smoke/v1",status:"REFERENCE_HOST_HELP_ONLY",
  hosts:pinned.map((x,i)=>({id:x.id,repository:x.repository,commit:x.commit,tree:x.tree,
   packageVersion:i===0?"4.5.1":"1.0.0",
   runtime:i===0?"node-pi-entrypoint":"go-installer-binary",
   exitCode:0,outputSha256:"0".repeat(64),outputBytes:100,
   onlyHelp:true,repositoryClean:true})),
  executedCases:0,modelCalls:0,writerAuthorized:false,
  referenceBProvisioned:false,fullParity:false};
}
const prepared=(props={})=>buildR4FirstFivePreflight({candidateSha:sha,
 hostSmoke:hostSmoke(),readiness:buildAgentABCaseReadiness({candidateSha:sha}),...props});
test("R4-04 five cases have real executable readiness but ZERO runtime comparisons",()=>{
 const r=prepared();
 assert.deepEqual(r.cases.map(x=>x.id),FIRST_FIVE);
 assert.equal(r.nativeHostPreflight.sourceA.version,"4.5.1");
 assert.equal(r.nativeHostPreflight.sourceA.expectedUiVersion,"4.6.0");
 assert.equal(r.nativeHostPreflight.sourceA.versionAligned,false);
 assert.equal(r.nativeHostPreflight.sourceB.agentHostProvisioned,false);
 assert.equal(r.status,"BLOCKED_REFERENCE_RUNTIME_PREPARATION");
 assert.equal(r.slotsRequired,15);
 assert.equal(r.sourceSlotsCaptured,0);
 assert.equal(r.scenariosExecuted,0);
 assert.equal(r.modelCalls,0);
 assert.equal(r.humanConsent,false);
 assert.equal(r.globalFull,false);
 assert.ok(r.cases.every(x=>x.status==="BLOCKED"&&x.executedSources.length===0&&
  x.blockers.includes("NO_AUTHENTIC_THREE_WAY_AGENT_OBSERVATIONS")));
});
test("R4-04 project fixture contains safe deterministic four-file read-only setup",()=>{
 const r=prepared();
 assert.match(r.fixture.sha256,/^[a-f0-9]{64}$/u);
 assert.equal(r.fixture.sha256,fingerprintFirstFiveFixture());
 assert.deepEqual(r.fixture.files,["README.md","src/entry.mjs","src/math.mjs","src/report.mjs"]);
 assert.equal(r.cases.length,5);
 assert.ok(r.cases.every(x=>typeof x.prompt==="string"&&x.prompt.length>45));
});
test("R4-04 does not silently re-pin A or certify scenarios when A package is aligned",()=>{
 const source=hostSmoke();source.hosts[0].packageVersion="4.6.0";
 const result=prepared({hostSmoke:source});
 assert.equal(result.nativeHostPreflight.sourceA.versionAligned,true);
 assert.equal(result.status,"BLOCKED_REFERENCE_RUNTIME_PREPARATION");
 assert.equal(result.sourceSlotsCaptured,0);
 assert.equal(result.scenariosExecuted,0);
 assert.equal(result.globalFull,false);
});
test("R4-04 rejects forged A/B runtime, help-only evidence or positive completion claims",()=>{
 for(const change of [
  x=>x.fullParity=true,x=>x.executedCases=1,x=>x.referenceBProvisioned=true,
  x=>x.hosts[1].onlyHelp=false,x=>x.hosts[0].packageVersion="",
  x=>x.hosts[0].commit="b".repeat(40),x=>x.hosts[1].runtime="native-agent",
  x=>x.hosts[1].repositoryClean=false,
 ]){const h=hostSmoke();change(h);assert.throws(()=>prepared({hostSmoke:h}));}
});
test("R4-04 requires exact ASEN SHA and matching readiness before any report",()=>{
 assert.throws(()=>prepared({candidateSha:"not-a-sha"}),/commit/u);
 const readiness=buildAgentABCaseReadiness({candidateSha:sha});
 assert.throws(()=>prepared({readiness:{...readiness,candidateSha:"b".repeat(40)}}));
 assert.throws(()=>prepared({readiness:{...readiness,evidenceCaptured:1}}));
 assert.throws(()=>prepared({readiness:{...readiness,referenceCasesExecuted:1}}));
 const fake=structuredClone(readiness);
 fake.cases[0].stage="EXECUTED";
 assert.throws(()=>prepared({readiness:fake}));
});
test("R4-04 fixture digest fails on unsupported path, missing file and unbounded content",()=>{
 assert.throws(()=>fingerprintFirstFiveFixture({...FIRST_FIVE_FIXTURE,files:{"../outside":"no"}}));
 assert.throws(()=>fingerprintFirstFiveFixture({...FIRST_FIVE_FIXTURE,files:{...FIRST_FIVE_FIXTURE.files,"secret.txt":"unexpected"}}));
 assert.throws(()=>fingerprintFirstFiveFixture({...FIRST_FIVE_FIXTURE,files:{...FIRST_FIVE_FIXTURE.files,"README.md":"x".repeat(2049)}}));
});
