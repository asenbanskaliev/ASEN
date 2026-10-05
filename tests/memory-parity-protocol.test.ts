// @ts-nocheck -- exercised by Node's dependency-free type stripping in this isolated worktree.
import assert from "node:assert/strict";
import {resolve} from "node:path";
import test from "node:test";
// @ts-expect-error Dependency-free offline JavaScript registry.
import {MEMORY_PROTOCOL_FIXTURE,memoryProtocolSlice,validateMemoryProtocol,writerAParitySlices} from "../scripts/memory-parity/writer-a/index.mjs";

const ROOT=resolve(import.meta.dirname,"..");
const COMMIT="e5c2277f856a5ee8739f297a006cabf6432ba77d";
const fixture=memoryProtocolSlice.load(ROOT);
const mutate=(change:(value:any)=>void)=>{const value=structuredClone(fixture);change(value);return value;};

const frozen=value=>{
 if(value&&typeof value==="object"){
  assert.equal(Object.isFrozen(value),true);
  for(const child of Object.values(value))frozen(child);
 }
};

test("writer A exposes one exact callable descriptor and deeply frozen fixture",()=>{
 assert.deepEqual(Object.keys(memoryProtocolSlice).sort(),["fixturePath","id","load","successLabel","validate"]);
 assert.equal(memoryProtocolSlice.id,"current-memory-protocol-authority");
 assert.equal(memoryProtocolSlice.fixturePath,MEMORY_PROTOCOL_FIXTURE);
 assert.equal(memoryProtocolSlice.successLabel,"1 current-memory-protocol source-inspected contract");
 assert.deepEqual(writerAParitySlices,[memoryProtocolSlice]);
 frozen(fixture);assert.deepEqual(validateMemoryProtocol(fixture),[]);
});

test("fixture pins authority, exact source order, complete spans, and seven canonical rules",()=>{
 assert.equal(fixture.evidenceLevel,"SOURCE_INSPECTED");assert.equal(fixture.authority.commit,COMMIT);
 assert.equal(fixture.authority.direction,"DOCS canonical prose governs behavioral alignment, not byte equality");
 assert.match(fixture.authority.olderStoreAuthority,/15a2f78885d7ad8ced23b2d1d88383e9bb472c17 remains authoritative/);
 assert.deepEqual(fixture.sources.map(source=>source[0]),["canonical-docs","contributor-skill","setup-template","claude-skill","codex-skill","pi-runtime","opencode-setup-source","opencode-generated-plugin"]);
 assert.deepEqual(fixture.sources.map(source=>[source[7],source[8]]),[[[1366,1471],[1365,1472]],[[1,63],[null,null]],[[151,249],[150,250]],[[1,133],[null,null]],[[1,127],[null,null]],[[73,126],[72,127]],[[65,146],[64,147]],[[65,146],[64,147]]]);
 assert.deepEqual(fixture.authority.canonicalProtocolBoundary,{completeInclusive:[1366,1471],firstNonProtocolStructuralBoundary:1473});
 assert.deepEqual(fixture.rules.map(rule=>[rule[0],rule[1],rule[2]]),[
  ["save","WHEN TO SAVE (mandatory)",["canonical-docs",1372,1396,1371,1397]],
  ["topic","Topic update rules (mandatory)",["canonical-docs",1398,1403,1397,1404]],
  ["delivery","DELIVERY GUARANTEE",["canonical-docs",1405,1407,1404,1408]],
  ["recall","WHEN TO SEARCH MEMORY",["canonical-docs",1409,1420,1408,1421]],
  ["session-close","SESSION CLOSE PROTOCOL (mandatory)",["canonical-docs",1422,1446,1421,1447]],
  ["passive","PASSIVE CAPTURE",["canonical-docs",1448,1461,1447,1462]],
  ["post-compaction","AFTER COMPACTION",["canonical-docs",1463,1471,1462,1473]]
 ]);
 for(const required of ["immediately","topic_key","final message","proactively","Goal","numbered items","only then continue"])
  assert.match(fixture.rules.map(rule=>rule[3]).join("\n"),new RegExp(required,"i"));
});

test("companion inventory distinguishes adaptations, omissions, and the sole byte-copy pair",()=>{
 assert.deepEqual(fixture.companions.map(({id,classification})=>[id,classification]),[["contributor-skill","adapted"],["setup-template","adapted"],["claude-skill","adapted"],["codex-skill","adapted"],["pi-runtime","adapted"],["opencode-pair","generated-byte-copy"]]);
 assert.deepEqual(fixture.companions.map(({id,evidence})=>[id,evidence]),[
  ["contributor-skill",[[22,36],[40,44],[48,57],[61,63]]],
  ["setup-template",[[155,185],[187,197],[199,225],[227,239],[241,248]]],
  ["claude-skill",[[11,31],[33,98],[100,132]]],
  ["codex-skill",[[11,25],[27,92],[94,126]]],
  ["pi-runtime",[[73,76],[78,101],[103,119],[121,126]]],
  ["opencode-pair",[["opencode-setup-source",65,146],["opencode-generated-plugin",65,146]]]
 ]);
 const contributor=fixture.companions.find(item=>item.id==="contributor-skill");
 assert.deepEqual(contributor.additions,["first-message proactive search"]);
 assert.deepEqual(contributor.omissions,["canonical title/type/scope formatting","topic suggestion and exact-ID correction detail","mem_get_observation","session-summary Instructions","passive capture"]);
 const setup=fixture.companions.find(item=>item.id==="setup-template");
 assert.deepEqual(setup.additions,["mem_session_end after summary","task-or-subtask passive capture wording","direct passive capture safety net","FIRST ACTION REQUIRED compaction trigger"]);
 const opencode=fixture.companions.find(item=>item.id==="opencode-pair");
 assert.deepEqual(opencode.additions,["first-message proactive search","session-only compaction context","FIRST ACTION REQUIRED compaction trigger"]);
 assert.deepEqual(opencode.additionEvidence,[{addition:"FIRST ACTION REQUIRED compaction trigger",sources:[["opencode-setup-source",140,140],["opencode-generated-plugin",140,140]]}]);
 assert.equal(fixture.sources[6][3],fixture.sources[7][3]);assert.equal(fixture.sources[6][4],fixture.sources[7][4]);
 assert.deepEqual(opencode.omissions,["passive capture","automatic post-compaction mem_context"]);
 const pi=fixture.companions.find(item=>item.id==="pi-runtime");
 assert.deepEqual(pi.additions,["authoritative Pi provider and tool-name guidance","project-scoped search fallback","project recovery for failed session summary","outcome-specific compaction precedence"]);
 assert.deepEqual(pi.omissions,["topic update and correction rules","proactive search","passive capture"]);
 assert.deepEqual(fixture.companions.filter(item=>item.classification==="generated-byte-copy").map(item=>item.id),["opencode-pair"]);
});

test("claim ceiling keeps runtime work and older contracts outside this reference",()=>{
 assert.deepEqual(fixture.limitations,["Prose or source presence does not establish tool availability.","SOURCE_INSPECTED evidence does not establish prompt injection.","SOURCE_INSPECTED evidence does not establish lifecycle execution or persistence.","This contract does not establish host or runtime parity.","This contract does not establish FULL parity.","E3-09, E3-10, and E3-11 remain open.","Current-main protocol authority does not retarget older store contracts."]);
});

test("validator returns string issues for every hostile value without throwing or false acceptance",()=>{
 const circular:any={};circular.self=circular;
 const revoked=Proxy.revocable({},{});revoked.revoke();
 const throwing=new Proxy({},{getPrototypeOf(){throw new Error("hostile prototype")}});
 const disguised=new Proxy(fixture,{});
 const inheritedToJSON=Object.assign(Object.create({toJSON(){return fixture}}),fixture);
 const ownToJSON={toJSON(){return fixture}};
 const hostile=[undefined,null,true,0,1n,Symbol("contract"),"contract",()=>fixture,[],new Date(),new Map(),Object.create(null),circular,{value:1n},revoked.proxy,throwing,disguised,inheritedToJSON,ownToJSON];
 for(const value of hostile){
  let issues:string[]|undefined;
  assert.doesNotThrow(()=>{issues=validateMemoryProtocol(value)});
  assert.ok(Array.isArray(issues)&&issues.length>0);assert.ok(issues.every(issue=>typeof issue==="string"));
 }
});

test("validator uses guarded structural exactness across serialization collisions",()=>{
 assert.deepEqual(validateMemoryProtocol(structuredClone(fixture)),[]);
 const reordered=Object.fromEntries(Object.entries(structuredClone(fixture)).reverse());
 assert.deepEqual(validateMemoryProtocol(reordered),[]);
 const collisions=[
  value=>{value.sourceInvariants.cr=-0},
  value=>{value.sourceInvariants.cr=Number.NaN},
  value=>{value.sourceInvariants.cr=Number.POSITIVE_INFINITY},
  value=>{value.sourceInvariants.cr=Number.NEGATIVE_INFINITY},
  value=>{value.sourceInvariants.cr=undefined},
  value=>{Object.defineProperty(value.sourceInvariants,"cr",{get(){throw new Error("unsafe accessor")},enumerable:true})},
  value=>{value.sourceInvariants.toJSON=()=>fixture}
 ];
 for(const change of collisions)assert.notDeepEqual(validateMemoryProtocol(mutate(change)),[]);
});

test("validator rejects unknown claims, end-minus-one, ledger mutations, and evidence mutations",()=>{
 const changes=[
  value=>{value.unknown=true},value=>{value.runtimeParity=true},value=>{value.limitations[4]="FULL parity established."},
  value=>{value.sources[0][3]="0000000000000000000000000000000000000000"},value=>{value.sources[0][7][1]=1470},value=>{value.sources[1]=structuredClone(value.sources[0])},
  value=>{value.authority.canonicalProtocolBoundary.firstNonProtocolStructuralBoundary=1472},value=>{value.rules[6][2][1]=1470},value=>{value.rules.reverse()},
  value=>{value.companions[0].omissions.pop()},value=>{value.companions[1].additions.pop()},value=>{value.companions[4].evidence[0]=[73,75]},
  value=>{value.companions[5].additionEvidence[0].sources[0][1]=139},value=>{value.companions.push(structuredClone(value.companions[0]))}
 ];
 for(const change of changes)assert.notDeepEqual(validateMemoryProtocol(mutate(change)),[]);
});
