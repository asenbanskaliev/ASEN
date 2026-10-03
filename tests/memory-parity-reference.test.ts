import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {resolve} from "node:path";
import test from "node:test";
// @ts-expect-error Dependency-free offline JavaScript validator.
import {loadCheckedInMemoryContextTimeline,loadCheckedInMemoryFoundation,loadCheckedInMemoryObservationWrites,loadCheckedInMemoryParity,loadCheckedInMemoryProjectIdentity,loadCheckedInMemoryRetrievalSearch,loadCheckedInMemorySessionStore,loadCheckedInMemorySessionTransport,validateMemoryContextTimeline,validateMemoryFoundation,validateMemoryObservationWrites,validateMemoryParity,validateMemoryProjectIdentity,validateMemoryRetrievalSearch,validateMemorySessionStore,validateMemorySessionTransport} from "../scripts/audit-memory-parity.mjs";

const baseline=loadCheckedInMemoryParity();
const clone=()=>structuredClone(baseline);
const errors=(value:unknown):string[]=>validateMemoryParity(value);
const expectError=(value:unknown,pattern:RegExp)=>assert.match(errors(value).join("\n"),pattern);

test("checked-in frozen memory reference and honest baseline are structurally valid",()=>{
 assert.deepEqual(errors(baseline),[]);
 assert.equal(baseline.scope,"reference_only");
 assert.deepEqual([...new Set(baseline.families.map((family:any)=>family.status))].sort(),["MISSING","PARTIAL"]);
});

test("rejects unsupported FULL despite attempted evidence fields",()=>{
 for(const evidence of [undefined,[],["tests/forged.test.ts"]]){
  const input=clone();
  input.families[0].status="FULL";
  if(evidence!==undefined)input.families[0].evidence=evidence;
  expectError(input,/FULL|unknown or missing properties/);
 }
});

test("pins both release identities and separates the Pi channel",()=>{
 const missing=clone();missing.targets.pop();expectError(missing,/exactly two unique IDs/);
 const commit=clone();commit.targets[0].commit="f".repeat(40);expectError(commit,/invalid commit/);
 const tag=clone();tag.targets[1].tagObject="A".repeat(40);expectError(tag,/tagObject|full lowercase Git hashes/);
 const timestamp=clone();timestamp.targets[0].publishedAt="invented";expectError(timestamp,/publishedAt/);
});

test("requires primitive IDs resolved only from own target anchors",()=>{
 for(const inherited of ["toString","constructor","__proto__"]){
  const input=clone();input.targets[1].id=inherited;expectError(input,/unknown target ID/);
 }
 const target=clone();target.targets[1].id=["pi"];expectError(target,/target ID must be a string/);
 const source=clone();source.sources[0].id=[source.sources[0].id];expectError(source,/source IDs must be strings/);
 const family=clone();family.families[0].id=[family.families[0].id];expectError(family,/family IDs must be strings/);
});

test("requires exact known properties at every schema level",()=>{
 for(const mutate of [
  (input:any)=>{input.claimsParity=true;},
  (input:any)=>{input.targets[0].authenticated=true;},
  (input:any)=>{input.sources[0].observedAt="now";},
  (input:any)=>{input.families[0].approved=false;}
 ]){const input=clone();mutate(input);expectError(input,/unknown or missing properties/);}
});

test("validates pinned source tuples and canonical raw URL bindings",()=>{
 const bytes=clone();bytes.sources[0].bytes=0;expectError(bytes,/byte\/hash tuple|pinned/);
 const large=clone();large.sources[0].bytes=2*1024*1024+1;expectError(large,/byte\/hash tuple|pinned/);
 const hash=clone();hash.sources[0].sha256="0".repeat(64);expectError(hash,/pinned byte\/hash tuple/);
 const path=clone();path.sources[0].path="../store.go";expectError(path,/canonical relative syntax/);
 const arrayPath=clone();arrayPath.sources[0].path=[arrayPath.sources[0].path];expectError(arrayPath,/path must be a string/);
 const raw=clone();raw.sources[0].rawUrl=raw.sources[1].rawUrl;expectError(raw,/unique IDs, paths, and URLs|raw URL/);
 const id=clone();id.sources[0].id="SRC-MEM-999";expectError(id,/exact unique IDs/);
});

test("binds API and tag URLs to each declared repository and tag",()=>{
 const api=clone();api.targets[0].apiRefUrl=api.targets[1].apiRefUrl;expectError(api,/API URL/);
 const tag=clone();tag.targets[1].tagUrl=tag.targets[0].tagUrl;expectError(tag,/tag URL/);
});

test("rejects repository substitution even when every dependent URL is rewritten",()=>{
 const substitute=(input:any,targetId:string)=>{
  const target=input.targets.find((candidate:any)=>candidate.id===targetId);
  target.repository=`attacker-${targetId}/owned`;
  target.apiRefUrl=`https://api.github.com/repos/${target.repository}/git/ref/tags/${target.tag}`;
  target.tagUrl=`https://github.com/${target.repository}/releases/tag/${target.tag}`;
  for(const source of input.sources.filter((candidate:any)=>candidate.targetId===targetId))
   source.rawUrl=`https://raw.githubusercontent.com/${target.repository}/${target.commit}/${source.path}`;
 };
 for(const targetIds of [["core"],["pi"],["core","pi"]]){
  const input=clone();
  for(const targetId of targetIds)substitute(input,targetId);
  expectError(input,/repository identity/);
 }
});

test("requires every pinned source tuple to belong to the core snapshot",()=>{
 for(const count of [1,baseline.sources.length]){
  const input=clone(),pi=input.targets.find((target:any)=>target.id==="pi");
  for(const source of input.sources.slice(0,count)){
   source.targetId="pi";
   source.rawUrl=`https://raw.githubusercontent.com/${pi.repository}/${pi.commit}/${source.path}`;
  }
  expectError(input,/core snapshot/);
 }
});

test("requires exact 18-family coverage and documented honest states",()=>{
 const omitted=clone();omitted.families.pop();expectError(omitted,/exactly E3-01 through E3-18/);
 const duplicate=clone();duplicate.families[1].id="E3-01";expectError(duplicate,/exactly E3-01 through E3-18/);
 const status=clone();status.families[0].status="UNKNOWN";expectError(status,/invalid status/);
 for(const value of [null,1,{},[],""," "]){
  const title=clone();title.families[0].title=value;expectError(title,/title must be a nonempty string/);
 }
 const topLimitation=clone();topLimitation.limitations=[];expectError(topLimitation,/manifest limitations/);
 const whitespaceTop=clone();whitespaceTop.limitations[0]=" \t ";expectError(whitespaceTop,/manifest limitations/);
 const limitation=clone();limitation.families[0].limitations=[];expectError(limitation,/explicit limitations/);
 const whitespaceLimitation=clone();whitespaceLimitation.families[0].limitations[0]=" \t ";expectError(whitespaceLimitation,/explicit limitations/);
 const whitespaceFact=clone();whitespaceFact.families[0].facts=[" \t "];expectError(whitespaceFact,/facts must be a string array/);
 const emptyFacts=clone();emptyFacts.families[0].facts=[];assert.deepEqual(errors(emptyFacts),[]);
});

test("checked-in foundation fixture is source-inspected, complete, and structurally valid",()=>{
 const foundation=loadCheckedInMemoryFoundation();
 assert.deepEqual(validateMemoryFoundation(foundation),[]);
 assert.deepEqual(foundation.cases.map((item:any)=>item.id),Array.from({length:8},(_,i)=>`FND-${String(i+1).padStart(2,"0")}`));
 assert.equal(foundation.status,"SOURCE_INSPECTED");
 assert.equal(foundation.proofKind,"source_inspection");
});

test("foundation fixture rejects malformed identities, evidence, dimensions, and schema expansion",()=>{
 const foundation=loadCheckedInMemoryFoundation();
 const reject=(mutate:(input:any)=>void,pattern:RegExp)=>{
  const input=structuredClone(foundation);mutate(input);
  assert.match(validateMemoryFoundation(input).join("\n"),pattern);
 };
 reject(input=>{input.cases.pop();},/exact FND|eight unique/);
 reject(input=>{input.cases[1].id="FND-01";},/exact FND|eight unique/);
 reject(input=>{input.cases[0].id=["FND-01"];},/case IDs must be strings/);
 reject(input=>{input.sources[0].id=["SRC-FND-001"];},/source IDs must be strings/);
 reject(input=>{input.sources[0].commitRole="CORE-latest";},/commitRole/);
 reject(input=>{input.sources[0].sha256="0".repeat(64);},/pinned byte\/hash tuple/);
 reject(input=>{input.cases[0].evidence[0].endLine=9999;},/line range/);
 reject(input=>{input.cases[0].evidence[0].sourceId="SRC-FND-999";},/sourceId/);
 reject(input=>{input.cases[0].summary=" ";},/summary/);
 reject(input=>{input.cases[0].ordering=[];},/ordering/);
 reject(input=>{input.cases[0].unexpected=true;},/unknown or missing properties/);
 reject(input=>{input.sources[0].unexpected=true;},/unknown or missing properties/);
 reject(input=>{input.status="FULL";},/SOURCE_INSPECTED/);
 reject(input=>{input.proofKind="runtime";},/source_inspection/);
});

test("foundation critical values and ordering are independently anchored",()=>{
 const foundation=loadCheckedInMemoryFoundation();
 const reject=(id:string,mutate:(item:any)=>void,pattern:RegExp=/critical values|ordering/)=>{
  const input=structuredClone(foundation),item=input.cases.find((candidate:any)=>candidate.id===id);mutate(item);
  assert.match(validateMemoryFoundation(input).join("\n"),pattern);
 };
 reject("FND-04",item=>{item.criticalValues.busyTimeoutMs=0;});
 reject("FND-04",item=>{item.criticalValues.lockRetryBackoffMs=[10,20,40];});
 reject("FND-05",item=>{item.criticalValues.schemaVersion=3;});
 reject("FND-06",item=>{item.criticalValues.compatibleCrudPermitted=["GET"];});
 reject("FND-06",item=>{item.criticalValues.readOnly=true;});
 reject("FND-07",item=>{item.ordering.reverse();});
 reject("FND-08",item=>{item.criticalValues.priorFilesystemStateRolledBack=true;});
});

test("foundation requires exact independently pinned evidence for every case",()=>{
 const foundation=loadCheckedInMemoryFoundation();
 const reject=(mutate:(input:any)=>void)=>{
  const input=structuredClone(foundation);mutate(input);
  assert.match(validateMemoryFoundation(input).join("\n"),/pinned evidence/);
 };
 reject(input=>{input.cases.find((item:any)=>item.id==="FND-06").evidence.splice(1,4);});
 reject(input=>{input.cases.find((item:any)=>item.id==="FND-06").evidence=[{sourceId:"SRC-FND-001",startLine:1200,endLine:1210}];});
 reject(input=>{input.cases.find((item:any)=>item.id==="FND-06").evidence=[{sourceId:"SRC-FND-002",startLine:339,endLine:450}];});
 for(const item of foundation.cases)reject(input=>{input.cases.find((candidate:any)=>candidate.id===item.id).evidence[0].startLine++;});
 reject(input=>{input.cases[0].evidence.push({...input.cases[0].evidence[0]});});
});

test("observation-write fixture is source-inspected and complete",()=>{
 const fixture=loadCheckedInMemoryObservationWrites();
 assert.deepEqual(validateMemoryObservationWrites(fixture),[]);
 assert.deepEqual(fixture.cases.map((item:any)=>item.id),["OBS-01","OBS-02","OBS-03","OBS-04","OBS-05"]);
});

test("observation-write guards reject missing cases, substituted evidence, and malformed schema",()=>{
 const fixture=loadCheckedInMemoryObservationWrites();
 const reject=(mutate:(input:any)=>void,pattern:RegExp)=>{const input=structuredClone(fixture);mutate(input);assert.match(validateMemoryObservationWrites(input).join("\n"),pattern);};
 reject(input=>{input.cases.pop();},/exact OBS|five unique/);
 reject(input=>{input.cases[0].id=["OBS-01"];},/case IDs must be strings/);
 reject(input=>{input.sources[0].path=[input.sources[0].path];},/path must be a string/);
 reject(input=>{input.sources[0].sha256="0".repeat(64);},/pinned byte\/hash tuple/);
 reject(input=>{input.cases[2].evidence[0]={sourceId:"SRC-OBS-002",startLine:1447,endLine:1600};},/pinned evidence/);
 reject(input=>{input.cases[0].evidence.push({...input.cases[0].evidence[0]});},/pinned evidence/);
 reject(input=>{input.cases[0].transport=" ";},/transport/);
 reject(input=>{input.cases[0].unexpected=true;},/unknown or missing properties/);
});

test("observation-write conditional HTTP authentication requires exact helper implementation evidence",()=>{
 const fixture=loadCheckedInMemoryObservationWrites();
 const reject=(mutate:(input:any,item:any)=>void,pattern:RegExp)=>{
  const input=structuredClone(fixture),item=input.cases.find((candidate:any)=>candidate.id==="OBS-05");mutate(input,item);
  assert.match(validateMemoryObservationWrites(input).join("\n"),pattern);
 };
 reject((_input,item)=>{item.evidence=item.evidence.filter((evidence:any)=>!(evidence.sourceId==="SRC-OBS-003"&&evidence.startLine===146&&evidence.endLine===180));},/pinned evidence/);
 reject((_input,item)=>{const helper=item.evidence.find((evidence:any)=>evidence.sourceId==="SRC-OBS-003"&&evidence.startLine===146);helper.startLine=147;},/pinned evidence/);
 reject((input,_item)=>{input.sources.find((source:any)=>source.id==="SRC-OBS-003").lineStart=431;},/declared line range|line range/);
});

test("observation-write critical facts protect counters, barriers, privacy, auth, and queue semantics",()=>{
 const fixture=loadCheckedInMemoryObservationWrites();
 const reject=(id:string,mutate:(item:any)=>void)=>{const input=structuredClone(fixture),item=input.cases.find((candidate:any)=>candidate.id===id);mutate(item);assert.match(validateMemoryObservationWrites(input).join("\n"),/critical values/);};
 reject("OBS-01",item=>{item.criticalValues.newRow.duplicateCount=0;});
 reject("OBS-01",item=>{item.criticalValues.privateTagReplacement="secret_detector";});
 reject("OBS-02",item=>{item.criticalValues.duplicateDelta=1;});
 reject("OBS-03",item=>{item.criticalValues.revisionDelta=1;});
 reject("OBS-04",item=>{item.criticalValues.rejectionBarrier=["row"];});
 reject("OBS-04",item=>{item.criticalValues.httpStatus.mismatch_or_project_change=401;});
 reject("OBS-05",item=>{item.criticalValues.hard.relations="cascade";});
 reject("OBS-05",item=>{item.criticalValues.sync.unenrolled="delete_queue_row";});
 reject("OBS-05",item=>{item.criticalValues.http.authWrapper="tenant_authentication";});
});

test("observation-write limitations reject secret-detector, authentication, and automatic-retry claims",()=>{
 const fixture=loadCheckedInMemoryObservationWrites();
 for(const index of [1,2,3,4,5,6]){
  const input=structuredClone(fixture);input.limitations[index]="replacement claim";
  assert.match(validateMemoryObservationWrites(input).join("\n"),/limitations/);
 }
});

test("retrieval/search fixture is source-inspected and contains six contracts",()=>{
 const fixture=loadCheckedInMemoryRetrievalSearch();
 assert.deepEqual(validateMemoryRetrievalSearch(fixture),[]);
 assert.deepEqual(fixture.cases.map((item:any)=>item.id),["RET-01","RET-02","RET-03","RET-04","RET-05","RET-06"]);
 assert.equal(fixture.status,"SOURCE_INSPECTED");
});

test("retrieval/search guards reject semantic substitutions",()=>{
 const fixture=loadCheckedInMemoryRetrievalSearch();
 const mutations:[string,RegExp,(input:any)=>void][]=[
  ["representation",/representation/,input=>{input.sources[0].representation="raw_checkout";}],
  ["old raw hash",/byte\/hash tuple/,input=>{input.sources[0].sha256="2ffd000ee7f8c8fc1ad0c3d130e88a8ab4878449866c9737215b3c6d8ffa555b";}],
  ["source identity",/source identity/,input=>{input.sources[0].sourceIdentity=input.sources[0].path;}],
  ["missing any helper",/pinned evidence/,input=>{input.cases[1].evidence.splice(3,2);}],
  ["all quote-only",/critical values/,input=>{input.cases[1].criticalValues.all.quoteOnly="dropped";}],
  ["any doubled quotes",/critical values/,input=>{input.cases[1].criticalValues.any.interiorQuotes="double_every_quote";}],
  ["byte threshold",/critical values/,input=>{input.cases[2].criticalValues.shortThresholdRunes="utf8_bytes";}],
  ["wildcards",/critical values/,input=>{input.cases[2].criticalValues.escapedCharacters=["\\"]; }],
  ["universal cap",/critical values/,input=>{input.cases[3].criticalValues.universal20=true;}],
  ["preview bytes",/critical values/,input=>{input.cases[4].criticalValues.unit="utf8_bytes";}],
  ["project isolation",/critical values/,input=>{input.cases[0].criticalValues.getProjectGuard=true;}],
  ["global get",/critical values/,input=>{input.cases[0].criticalValues.getFilter="project_and_id";}],
  ["deleted bypass",/critical values/,input=>{input.cases[5].criticalValues.deletedExcludedFrom=["fts"]; }],
  ["tuple substitution",/pinned evidence/,input=>{input.cases[0].evidence[0]={...input.cases[0].evidence[1]};}]
 ];
 const failures:string[]=[];
 for(const [name,pattern,mutate] of mutations){
  const input=structuredClone(fixture);mutate(input);
  if(!pattern.test(validateMemoryRetrievalSearch(input).join("\n")))failures.push(name);
 }
 assert.deepEqual(failures,[]);
});

test("context/timeline fixture is source-inspected and contains exactly five contracts",()=>{
 const fixture=loadCheckedInMemoryContextTimeline();
 assert.deepEqual(validateMemoryContextTimeline(fixture),[]);
 assert.deepEqual(fixture.cases.map((item:any)=>item.id),["CTX-core-options","CTX-core-byte-helper","CTX-HTTP-context","CTX-MCP-complete-result","CTX-timeline"]);
 assert.equal(fixture.status,"SOURCE_INSPECTED");
 assert.equal(fixture.proofKind,"source_inspection");
});

test("context/timeline guards reject semantic substitutions",()=>{
 const fixture=loadCheckedInMemoryContextTimeline();
 const mutations:[string,(input:any)=>void][]=[
  ["configured default made universal",input=>{input.cases[0].criticalValues.sectionCaps.zero.observations="universal_20";}],
  ["pinned default capped",input=>{input.cases[0].criticalValues.sectionCaps.zero.pinned=20;}],
  ["preview changed to bytes",input=>{input.cases[0].criticalValues.previews.unit="utf8_bytes";}],
  ["preview hard ceiling",input=>{input.cases[0].criticalValues.previews.renderedHardCeiling=true;}],
  ["compact drops prompts",input=>{input.cases[0].criticalValues.compact.omits.push("prompts");}],
  ["zero byte budget bounded",input=>{input.cases[1].criticalValues.nonpositive="empty";}],
  ["tiny budget gets marker",input=>{input.cases[1].criticalValues.tinyPositive="marker";}],
  ["HTTP envelope included",input=>{input.cases[2].criticalValues.byteBudgetScope="json_envelope";}],
  ["HTTP positive section uncapped",input=>{input.cases[2].criticalValues.sectionCeiling=0;}],
  ["MCP fraction truncates",input=>{input.cases[3].criticalValues.invalidBudget.fractional="truncate";}],
  ["MCP suffix order",input=>{input.cases[3].criticalValues.order.reverse();}],
  ["MCP pin cap",input=>{input.cases[3].criticalValues.pinnedCap=0;}],
  ["MCP project cap",input=>{input.cases[3].criticalValues.statsProjectCap=20;}],
  ["timeline store project guard",input=>{input.cases[4].criticalValues.storeProjectGuard=true;}],
  ["timeline includes deleted",input=>{input.cases[4].criticalValues.neighbors.deleted="included";}],
  ["timeline order",input=>{input.cases[4].criticalValues.resultOrder.reverse();}],
  ["timeline global authorization",input=>{input.cases[4].criticalValues.globalIdAuthorization=true;}],
  ["timeline MCP full bodies",input=>{input.cases[4].criticalValues.mcpPreview.neighborRunes="full";}]
 ];
 const failures:string[]=[];
 for(const [name,mutate] of mutations){
  const input=structuredClone(fixture);mutate(input);
  if(!/critical values/.test(validateMemoryContextTimeline(input).join("\n")))failures.push(name);
 }
 assert.deepEqual(failures,[]);
});

test("context/timeline guards pin schema, source tuples, evidence, and limitations",()=>{
 const fixture=loadCheckedInMemoryContextTimeline();
 const reject=(mutate:(input:any)=>void,pattern:RegExp)=>{const input=structuredClone(fixture);mutate(input);assert.match(validateMemoryContextTimeline(input).join("\n"),pattern);};
 reject(input=>{input.cases.pop();},/exact five CTX cases/);
 reject(input=>{input.sources[0].representation="raw_checkout";},/representation/);
 reject(input=>{input.sources[0].sha256="0".repeat(64);},/byte\/hash tuple/);
 reject(input=>{input.sources[1].sourceIdentity=input.sources[1].path;},/source identity/);
 reject(input=>{input.cases[3].evidence[0]={...input.cases[2].evidence[0]};},/pinned evidence/);
 reject(input=>{input.cases[4].evidence.pop();},/pinned evidence/);
 reject(input=>{input.limitations=[];},/limitations/);
 reject(input=>{input.cases[0].contract=" ";},/contract/);
 reject(input=>{input.cases[0].unexpected=true;},/unknown or missing properties/);
});

test("project-identity fixture is source-inspected and contains seven ordered contracts",()=>{
 const fixture=loadCheckedInMemoryProjectIdentity();
 assert.deepEqual(validateMemoryProjectIdentity(fixture),[]);
 assert.deepEqual(fixture.cases.map((item:any)=>item.id),["PRJ-override","PRJ-config","PRJ-git-remote","PRJ-git-root","PRJ-child","PRJ-ambiguous","PRJ-basename"]);
 assert.equal(fixture.status,"SOURCE_INSPECTED");
});

test("project-identity claims cite each required direct helper definition",()=>{
 const fixture=loadCheckedInMemoryProjectIdentity();
 const required:[string,string,number,number][]=[
  ["PRJ-child","SRC-PRJ-001",84,99],
  ["PRJ-config","SRC-PRJ-001",311,320],["PRJ-config","SRC-PRJ-001",513,521],
  ["PRJ-git-remote","SRC-PRJ-002",30,32],["PRJ-git-root","SRC-PRJ-002",30,32],
  ["PRJ-basename","SRC-PRJ-001",513,521],["PRJ-basename","SRC-PRJ-003",125,134]
 ];
 const missing=required.filter(([caseId,sourceId,startLine,endLine])=>!fixture.cases.find((item:any)=>item.id===caseId)?.evidence.some((entry:any)=>entry.sourceId===sourceId&&entry.startLine===startLine&&entry.endLine===endLine));
 assert.deepEqual(missing,[],`missing direct helper tuples: ${JSON.stringify(missing)}`);
 for(const tuple of required)for(const mode of ["remove","substitute","alter"]){
  const input=structuredClone(fixture),item=input.cases.find((candidate:any)=>candidate.id===tuple[0]);
  const index=item.evidence.findIndex((entry:any)=>entry.sourceId===tuple[1]&&entry.startLine===tuple[2]&&entry.endLine===tuple[3]);
  if(mode==="remove")item.evidence.splice(index,1);
  else if(mode==="substitute")item.evidence[index]={sourceId:"SRC-PRJ-001",startLine:137,endLine:203};
  else item.evidence[index].startLine++;
  assert.notDeepEqual(validateMemoryProjectIdentity(input),[],`${mode} accepted ${tuple.join(":")}`);
 }
});

test("project-identity guards reject 27 bounded semantic substitutions",()=>{
 const fixture=loadCheckedInMemoryProjectIdentity(),cases=Object.fromEntries(fixture.cases.map((item:any)=>[item.id,item]));
 const mutations:[string,(input:any)=>void][]=[
  ["priority",input=>{input.cases[0].criticalValues.priority=["explicit","all_bypass","process_override","cwd_detection"];}],
  ["all bypass",input=>{input.cases[0].criticalValues.allBypassesInputs=false;}],
  ["explicit required",input=>{input.cases[0].criticalValues.explicitEmpty="detect_cwd";}],
  ["known callback conditions",input=>{input.cases[0].criticalValues.knownChecks.onlyWhenRequired=false;}],
  ["nearest config",input=>{input.cases[1].criticalValues.insideGit="checkout_root_only";}],
  ["outside parent leak",input=>{input.cases[1].criticalValues.outsideParentLeak=true;}],
  ["existing binding wins",input=>{input.cases[2].criticalValues.existingBindingWins=false;}],
  ["creation permissions",input=>{input.cases[2].criticalValues.creation.mode="0644";}],
  ["creation fail closed",input=>{input.cases[2].criticalValues.invalidExisting="replace_binding";}],
  ["security scope",input=>{input.limitations[2]="Project callbacks prove tenant isolation.";}],
  ["root seeding",input=>{input.cases[3].criticalValues.seed="every_detection";}],
  ["root errors",input=>{input.cases[3].criticalValues.failClosed=false;}],
  ["percent decode",input=>{input.cases[2].criticalValues.remote.percentDecode=true;}],
  ["separator collapse",input=>{input.cases[2].criticalValues.canonicalization.collapseOnly=["-","_"];}],
  ["ambiguity preserved",input=>{input.cases[5].criticalValues.available.separatorCollapse=true;}],
  ["scan depth",input=>{input.cases[4].criticalValues.depth="recursive";}],
  ["child errors",input=>{input.cases[4].criticalValues.error="basename_fallback";}],
  ["child source",input=>{input.cases[4].criticalValues.success.source="git_remote";}],
  ["child warning",input=>{input.cases[4].criticalValues.success.warning="empty";}],
  ["fallback unknown",input=>{input.cases[6].criticalValues.emptyDotOrPathLike="empty";}],
  ["fallback warning",input=>{input.cases[6].criticalValues.warning="scan failed";}],
  ["source pin",input=>{input.sources[0].bytes=20411;}],
  ["source identity",input=>{input.sources[1].sourceIdentity=input.sources[1].path;}],
  ["evidence order",input=>{input.cases[1].evidence.reverse();}],
  ["callsite only",input=>{input.cases[0].evidence.splice(1,1);}],
  ["limitations",input=>{input.limitations.pop();}],
  ["schema",input=>{input.cases[0].claim="runtime";}]
 ];
 assert.equal(Object.keys(cases).length,7);
 const accepted:string[]=[];
 for(const [name,mutate] of mutations){const input=structuredClone(fixture);mutate(input);if(validateMemoryProjectIdentity(input).length===0)accepted.push(name);}
 assert.deepEqual(accepted,[],`accepted altered contracts: ${accepted.join(", ")}`);
});

const deepFreeze=<T>(value:T):T=>{
 if(value&&typeof value==="object")for(const nested of Object.values(value))deepFreeze(nested);
 return value&&typeof value==="object"?Object.freeze(value):value;
};
const expectedSessionTransport=deepFreeze({
 caseIds:["SES-MCP-start-resolution","SES-serialized-write-queue"],
 sources:[
  ["SRC-SES-001","internal/mcp/mcp.go",143683,"72dc51bdf5c5ca93540cb678ad22cd314c439154f36315adba78db66080874bb","a9aed618bd0d24bb996add8984ca99267974bcd4",187,3326,3624],
  ["SRC-SES-002","internal/project/resolution.go",4282,"3e4da942e70b4b7a344c2c87a7394e159d53ee03fc3a1c86a3baaf2a82e7746a","52d758a315ee5273840ddb2d305559837f837268",12,104,138],
  ["SRC-SES-003","internal/mcp/write_queue.go",2634,"15ee24135108c1ce75b605f538e6d1e51107d8211e590ef63b06c546695a44ef","7d0a3da0366f133e8641267c620d548127498238",11,104,104]
 ],
 evidence:{
  "SES-MCP-start-resolution":[["SRC-SES-001",187,193],["SRC-SES-001",199,205],["SRC-SES-001",887,907],["SRC-SES-001",2397,2404],["SRC-SES-001",2411,2411],["SRC-SES-001",2431,2440],["SRC-SES-001",2826,2828],["SRC-SES-001",3297,3326],["SRC-SES-002",12,20],["SRC-SES-002",48,82],["SRC-SES-002",68,76],["SRC-SES-002",90,104]],
  "SES-serialized-write-queue":[["SRC-SES-001",433,433],["SRC-SES-001",887,907],["SRC-SES-003",11,14],["SRC-SES-003",16,29],["SRC-SES-003",31,38],["SRC-SES-003",40,49],["SRC-SES-003",52,61],["SRC-SES-003",63,89],["SRC-SES-003",91,104]]
 }
});

const sessionFixture=()=>loadCheckedInMemorySessionTransport();
const sessionTuples=(item:any)=>item.evidence.map((entry:any)=>[entry.sourceId,entry.startLine,entry.endLine]);

test("session transport requires the runtime-directory handler call",()=>{
 const input=sessionFixture(),item=input.cases.find((candidate:any)=>candidate.id==="SES-MCP-start-resolution");
 item.evidence=item.evidence.filter((entry:any)=>!(entry.sourceId==="SRC-SES-001"&&entry.startLine===2411&&entry.endLine===2411));
 assert.notDeepEqual(validateMemorySessionTransport(input),[],"accepted runtime-directory claim without its handler call");
});

test("session transport fixture pins exactly two contracts and three immutable source identities",()=>{
 const fixture=sessionFixture();
 assert.deepEqual(validateMemorySessionTransport(fixture),[]);
 assert.deepEqual(fixture.cases.map((item:any)=>item.id),expectedSessionTransport.caseIds);
 assert.deepEqual(fixture.sources.map((source:any)=>[source.id,source.path,source.bytes,source.sha256,source.gitBlob,source.lineStart,source.lineEnd,source.lineFeeds]),expectedSessionTransport.sources);
 for(const item of fixture.cases)assert.deepEqual(sessionTuples(item),expectedSessionTransport.evidence[item.id as keyof typeof expectedSessionTransport.evidence]);
 assert.equal(Object.isFrozen(expectedSessionTransport.evidence["SES-MCP-start-resolution"]),true);
 assert.equal(Object.isFrozen(expectedSessionTransport.evidence["SES-MCP-start-resolution"][0]),true);
});

test("session transport rejects removal, substitution, and range changes for every direct definition",()=>{
 const fixture=sessionFixture();
 for(const expectedCase of expectedSessionTransport.caseIds){
  const tuples=expectedSessionTransport.evidence[expectedCase as keyof typeof expectedSessionTransport.evidence];
  for(let index=0;index<tuples.length;index++)for(const mode of ["remove","substitute","alter"]){
   const input=structuredClone(fixture),item=input.cases.find((candidate:any)=>candidate.id===expectedCase);
   if(mode==="remove")item.evidence.splice(index,1);
   else if(mode==="substitute"){const replacement=tuples[(index+1)%tuples.length]!;item.evidence[index]={sourceId:replacement[0],startLine:replacement[1],endLine:replacement[2]};}
   else item.evidence[index].endLine++;
   assert.notDeepEqual(validateMemorySessionTransport(input),[],`${mode} accepted ${expectedCase}:${index}`);
  }
 }
});

test("session transport rejects semantic substitutions and unproved boundary claims",()=>{
 const fixture=sessionFixture();
 const mutations:[string,(input:any)=>void][]=[
  ["id cast",input=>{input.cases[0].criticalValues.handler.nonstringOrMissingId="schema_reject";}],
  ["directory trim",input=>{input.cases[0].criticalValues.handler.directoryTransform="normalize_path";}],
  ["project schema",input=>{input.cases[0].criticalValues.schema.project="optional";}],
  ["explicit route",input=>{input.cases[0].criticalValues.explicitDirectory.route="Resolve";}],
  ["current mode",input=>{input.cases[0].criticalValues.omittedDirectory.mode="ResolutionExplicit";}],
  ["known process bypass",input=>{input.cases[0].criticalValues.omittedDirectory.requireKnownProcess=true;}],
  ["runtime internals",input=>{input.cases[0].criticalValues.runtimeDirectory.claim="implementation_proved";}],
  ["capacity",input=>{input.cases[1].criticalValues.queue.defaultCapacity=64;}],
  ["full queue",input=>{input.cases[1].criticalValues.queue.full="block";}],
  ["prestart cancel",input=>{input.cases[1].criticalValues.cancellation.beforeCallbackStart="run";}],
  ["postenqueue wait",input=>{input.cases[1].criticalValues.cancellation.afterEnqueue="select_context";}],
  ["midcallback",input=>{input.cases[1].criticalValues.cancellation.midCallback="unblocks_Do";}],
  ["callback error",input=>{input.cases[1].criticalValues.callback.error="tool_error";}],
  ["wrapper mapping",input=>{input.cases[1].criticalValues.wrapper.other="tool_error";}],
  ["durable true",input=>{input.cases[1].criticalValues.durableEnrollment=true;}],
  ["durable omitted",input=>{delete input.cases[1].criticalValues.durableEnrollment;}],
  ["limitations",input=>{input.limitations[1]="Store ID validation is proved.";}]
 ];
 const accepted:string[]=[];
 for(const [name,mutate] of mutations){const input=structuredClone(fixture);mutate(input);if(validateMemorySessionTransport(input).length===0)accepted.push(name);}
 assert.deepEqual(accepted,[],`accepted altered contracts: ${accepted.join(", ")}`);
});

const expectedSessionStore=deepFreeze({
 caseIds:["SES-store-id-validation","SES-store-start-sql-state","SES-store-create-ownership","SES-store-create-sql-state","SES-store-create-sync","SES-store-live-registration-conflict","SES-store-live-identity-repair","SES-store-ended-legacy-ownership-claim","SES-store-isolation-root-preflight","SES-store-isolation-selected-continuation","SES-store-resume-selection","SES-store-end-terminal-upsert"],
 source:["SRC-SES-STORE-001","internal/store/store.go",488121,"6c52f5e8f71e8d00e1ff5c5f10361142b89b500786b181c825e1d69ad31ee15e","a396d5d8eb91b956a12c23cd5e936a2b74dd7760",59,12246,13200],
 evidence:{
  "SES-store-id-validation":[["SRC-SES-STORE-001",59,59],["SRC-SES-STORE-001",149,151],["SRC-SES-STORE-001",3049,3059],["SRC-SES-STORE-001",3112,3119],["SRC-SES-STORE-001",3206,3209],["SRC-SES-STORE-001",11598,11600],["SRC-SES-STORE-001",11602,11607]],
  "SES-store-start-sql-state":[["SRC-SES-STORE-001",60,60],["SRC-SES-STORE-001",149,151],["SRC-SES-STORE-001",3106,3108],["SRC-SES-STORE-001",3112,3119],["SRC-SES-STORE-001",3206,3206],["SRC-SES-STORE-001",3347,3347],["SRC-SES-STORE-001",9402,9424],["SRC-SES-STORE-001",9426,9428],["SRC-SES-STORE-001",11609,11640]],
  "SES-store-create-ownership":[["SRC-SES-STORE-001",67,75],["SRC-SES-STORE-001",135,151],["SRC-SES-STORE-001",3049,3085],["SRC-SES-STORE-001",10797,10830]],
  "SES-store-create-sql-state":[["SRC-SES-STORE-001",3049,3085],["SRC-SES-STORE-001",9387,9400],["SRC-SES-STORE-001",11609,11640]],
  "SES-store-create-sync":[["SRC-SES-STORE-001",347,356],["SRC-SES-STORE-001",580,590],["SRC-SES-STORE-001",3069,3106],["SRC-SES-STORE-001",8154,8161],["SRC-SES-STORE-001",9324,9335],["SRC-SES-STORE-001",10636,10715]],
  "SES-store-live-registration-conflict":[["SRC-SES-STORE-001",67,75],["SRC-SES-STORE-001",135,151],["SRC-SES-STORE-001",3112,3119],["SRC-SES-STORE-001",3206,3220],["SRC-SES-STORE-001",3285,3289],["SRC-SES-STORE-001",3334,3347],["SRC-SES-STORE-001",10797,10830]],
  "SES-store-live-identity-repair":[["SRC-SES-STORE-001",3112,3119],["SRC-SES-STORE-001",3206,3222],["SRC-SES-STORE-001",3285,3289],["SRC-SES-STORE-001",3334,3373],["SRC-SES-STORE-001",9402,9424]],
  "SES-store-ended-legacy-ownership-claim":[["SRC-SES-STORE-001",67,75],["SRC-SES-STORE-001",135,151],["SRC-SES-STORE-001",3112,3119],["SRC-SES-STORE-001",3206,3223],["SRC-SES-STORE-001",3285,3347],["SRC-SES-STORE-001",3374,3379],["SRC-SES-STORE-001",10800,10830],["SRC-SES-STORE-001",10836,10868]],
  "SES-store-isolation-root-preflight":[["SRC-SES-STORE-001",3133,3145],["SRC-SES-STORE-001",3218,3245]],
  "SES-store-isolation-selected-continuation":[["SRC-SES-STORE-001",3133,3145],["SRC-SES-STORE-001",3218,3245],["SRC-SES-STORE-001",3274,3289]],
  "SES-store-resume-selection":[["SRC-SES-STORE-001",3121,3131],["SRC-SES-STORE-001",3147,3204],["SRC-SES-STORE-001",3274,3280]],
  "SES-store-end-terminal-upsert":[["SRC-SES-STORE-001",59,59],["SRC-SES-STORE-001",3381,3424],["SRC-SES-STORE-001",9324,9336],["SRC-SES-STORE-001",10636,10738],["SRC-SES-STORE-001",11598,11607],["SRC-SES-STORE-001",12241,12246]]
 },
 facts:{
  idSentinel:["ErrSessionIDRequired","session id is required"],blank:["strings.TrimSpace","empty"],validation:["ErrSessionIDRequired","nil"],
  createChain:["CreateSession","CreateSessionWithOwnershipMode","validateSessionID"],startChain:["StartSession","StartSessionWithOwnershipMode","startSessionRegistration","validateSessionID"],
  columns:["id","project","ownership_mode","directory","started_at","runtime_lease_expires_at","local_creation_project"],
  arguments:["id","project","mode","directory","Now()","runtimeSessionLeaseDuration","project","sqlWhitespaceTrimSet","sqlWhitespaceTrimSet","sqlWhitespaceTrimSet"],
  conflict:["fill_null_or_trimmed_blank","fill_null_or_trimmed_blank","fill_trimmed_blank","preserve","excluded_value"],
  errors:["propagate","propagate","ErrSessionAlreadyEnded"],ended:["ErrSessionAlreadyEnded","session has already ended",true,"sessions.ended_at IS NULL"],
  modes:["shared","project_owned"],lease:["+30 minutes","local_not_synchronized_and_nonterminal_informational"],whitespace:["sqlWhitespaceTrimSet","unicode.White_Space R16 then R32 ranges"],
  ownershipValidation:["validateSessionID","validSessionOwnershipMode","NormalizeProject","trimmed_project_required","withTx"],
  ownershipSentinels:["ErrInvalidSessionOwnershipMode","ErrProjectRequired","ErrSessionOwnershipMismatch","ErrProjectOwnershipAmbiguous"],
  ownershipMatrix:["allow","SessionProjectConflictError_unwraps_ErrSessionOwnershipMismatch","allow","ErrSessionOwnershipMismatch","ErrProjectOwnershipAmbiguous"],
  ownershipOrder:["sessionOwnershipTx","strict_project_owned_check","sessionProjectWriteError","createSessionTx"],
  createColumns:["id","project","ownership_mode","directory","started_at","local_creation_project"],
  createArguments:["id","project","mode","directory","Now()","project","sqlWhitespaceTrimSet","sqlWhitespaceTrimSet","sqlWhitespaceTrimSet"],
  createConflict:["fill_null_or_trimmed_blank","fill_null_or_trimmed_blank","fill_trimmed_blank","preserve"],
  syncOrder:["createSessionTx","persisted_row_reread","enqueueSyncMutationTx","commit"],
  persistedColumns:["id","ifnull(project, '')","ifnull(ownership_mode, '')","directory","started_at","ended_at","summary"],
  payloadFields:["ID","Project","OwnershipMode","Directory","StartedAt","EndedAt","Summary"],
  journal:["no_row","no_row","row_attempt",false,"UNPROVED"],
  liveConflict:{
   entry:{wrapper:"StartSessionWithOwnershipMode",delegate:"startSessionRegistration"},flags:{resume:false,effective:"nil",isolated:false},
   ordering:["sessionOwnershipTx","sessionRegistrationProjectError","startSessionTx"],
   matrix:{blankOrSameOwner:"allow",differentOwnerRequestedProjectOwned:{type:"SessionProjectConflictError",unwrap:"ErrSessionOwnershipMismatch"},differentOwnerExistingSharedRequestedShared:"allow",differentOwnerExistingProjectOwnedRequestedShared:{type:"wrapped_error",sentinel:"ErrSessionOwnershipMismatch"},differentOwnerUnclassifiedRequestedShared:{type:"wrapped_error",sentinel:"ErrProjectOwnershipAmbiguous"}},
   rejectionBeforeStart:true
  },
  liveRepair:{
   identityRepaired:{missingRow:"!found",foundLive:"existingProject_empty OR existingMode_empty OR strings.TrimSpace(existingDirectory)_empty"},
   startSessionTx:"always_called_after_ownership_acceptance",populatedIdentity:{enqueue:false,return:"nil_after_startSessionTx"},
   transaction:{scope:"same_withTx_callback",ordering:["sessionOwnershipTx","identity_repair_predicate","startSessionTx","persisted_row_reread","enqueueSyncMutationTx","commit"]},
   persistedColumns:["id","ifnull(project, '')","ifnull(ownership_mode, '')","directory","started_at","ended_at","summary"],payloadFields:["ID","Project","OwnershipMode","Directory","StartedAt","EndedAt","Summary"],
   payloadSource:"persisted_row",mutation:{entity:"session",op:"upsert",source:"local"},helperInvocationDurableSync:false
  },
  endedClaim:{
   flags:{resume:false,effective:"nil",isolated:false},
   condition:{found:true,requestedMode:"project_owned",existingProject:"blank",endedAt:"nonnull"},
   foreignChildOwner:{helper:"foreignRecordOwnerTx",conflictType:"SessionProjectConflictError",rejectionBeforeUpdate:true},
   update:{columns:["project","ownership_mode"],where:["ended_at IS NOT NULL","ifnull(trim(project, ?), '') = ''"],arguments:["project","mode","id","sqlWhitespaceTrimSet"],errors:{exec:"propagate",rowsAffected:"propagate",rowsNotOne:"claim_lost_error"}},
   transaction:{scope:"same_withTx_callback",ordering:["sessionOwnershipTx","ended_status_read","foreignRecordOwnerTx","conditional_ownership_update","rows_affected_exactly_one","persisted_row_reread","enqueueSyncMutationTx","claimed_true","commit","ErrSessionAlreadyEnded"]},
   persistedColumns:["id","ifnull(project, '')","ifnull(ownership_mode, '')","directory","started_at","ended_at","summary"],payloadFields:["ID","Project","OwnershipMode","Directory","StartedAt","EndedAt","Summary"],payloadSource:"persisted_row",mutation:{entity:"session",op:"upsert",source:"local"},
   claimed:{initial:false,resetEachWithTxCallback:true,setAfter:"enqueue_success",endedMapping:"only_after_successful_withTx",return:"ErrSessionAlreadyEnded",returnedEndedErrorImpliesNoSideEffects:false}
  },
  isolationPreflight:{
   sentinel:{name:"ErrSessionIsolationConflict",message:"isolated session registration requires an empty directory; existing runtime-bound sessions cannot be reused"},
   wrapper:{entry:"RegisterIsolatedSession",directory:"empty",mode:"project_owned",resume:"forward",effective:"id",isolated:true},
   transaction:{root:"id_before_withTx",eachAttemptReset:{id:"root"},ordering:["reset_id_to_root","validateIsolation(root)","resume_branch"]},
   preflight:{operation:"query_only",query:"SELECT ifnull(directory, '') FROM sessions WHERE id = ?",argument:"root",missingRow:"allow",trimmedBlank:"allow",queryError:"propagate",trimmedNonblank:{error:"wrap_ErrSessionIsolationConflict",sessionID:"quoted"}},
   rejection:{returnBefore:"resume_branch"}
  },
  selectedIsolation:{
   sentinel:{name:"ErrSessionIsolationConflict",message:"isolated session registration requires an empty directory; existing runtime-bound sessions cannot be reused"},
   wrapper:{entry:"RegisterIsolatedSession",directory:"empty",mode:"project_owned",resume:"forward",effective:"id",isolated:true},
   transaction:{root:"id_before_withTx",eachAttemptReset:{id:"root"},sharedValidation:"validateIsolation",ordering:["reset_id_to_root","validateIsolation(root)","continuationSessionTx(tx,root)","effective=selected_id","validateIsolation(selected_id)_if_distinct","sessionOwnershipTx"]},
   continuation:{call:"continuationSessionTx(tx,root)",error:"propagate",effective:"selected_id",selectionAlgorithm:"UNPROVED"},
   selectedCheck:{condition:"id != root",invocation:"only_when_distinct",sameAsRootPreflight:true,query:"SELECT ifnull(directory, '') FROM sessions WHERE id = ?",argument:"selected_id",missingRow:"allow",trimmedBlank:"allow",queryError:"propagate",trimmedNonblank:{error:"wrap_ErrSessionIsolationConflict",sessionID:"quoted"}},
   rejection:{returnBefore:"sessionOwnershipTx"}
  },
  resumeSelection:{
   wrapper:{entry:"ResumeSessionWithOwnershipMode",effectiveInitial:"id",registration:{resume:true,effective:"pointer",isolated:false},error:{id:"empty",error:"propagate"},success:{id:"effective",error:"nil"}},
   root:{query:"SELECT ended_at FROM sessions WHERE id = ?",argument:"root",missing:"return_root",live:"return_root",ended:"scan_continuations",queryError:"propagate"},
   range:{prefix:"root+:resume:",lower:"prefix+0",upper:"prefix+:",interval:"half_open",order:"ORDER BY id",collation:"source_declared_BINARY"},
   suffix:{required:"nonempty",accepted:"ASCII_digits_only",leadingZeros:"accepted",parse:{type:"big.Int",base:10,arbitraryPrecision:true},rejected:"continue"},
   selection:{maxInitial:"1",maxTracks:"greatest_numeric_suffix",liveTracks:"lowest_numeric_live_suffix",liveCondition:"ended_is_nil",liveReplacementComparison:"strict_numeric_less_than",numericTie:"retain_first_source_declared_BINARY_ordered_live_ID",tieExample:{first:"root+:resume:02",later:"root+:resume:2",selected:"root+:resume:02"},returnLive:"liveID",returnNew:"prefix+(max+1)",noAcceptedSuffix:"root+:resume:2"},
   errors:{order:["root_query_scan","continuation_query","row_scan","rows.Err"],behavior:"propagate"},
   invocation:{call:"continuationSessionTx(tx,root)",selectorError:"return_before_effective_assignment",success:"effective=selected_id"}
  },
  endTerminalUpsert:{
   entry:{method:"EndSession",validation:"validateSessionID",validationBefore:"withTx",blank:"ErrSessionIDRequired"},
   update:{sql:"UPDATE sessions SET ended_at = datetime('now'), summary = ? WHERE id = ?",arguments:["nullableString(summary)","id"],endedPredicate:false,alreadyEnded:"update_and_offer_enqueue_again"},
   summary:{empty:"NULL",nonemptyWhitespace:"preserved_unchanged"},
   transaction:{scope:"same_withTx_callback",ordering:["validateSessionID","beginTxHook","UPDATE","RowsAffected","zero_rows_nil_OR_persisted_row_reread","enqueueSyncMutationTx","commitHook"],zeroRows:"callback_nil_then_commit",errors:{validation:"propagate_before_begin",begin:"propagate",exec:"propagate",rowsAffected:"propagate",reread:"propagate",enqueue:"propagate",commit:"propagate"}},
   persistedColumns:["ifnull(project, '')","ifnull(ownership_mode, '')","directory","started_at","ended_at","summary"],payloadFields:["ID","Project","OwnershipMode","Directory","StartedAt","EndedAt","Summary"],
   payloadSource:{ID:"request_id",Project:"persisted",OwnershipMode:"persisted",Directory:"persisted",StartedAt:"persisted",EndedAt:"persisted_pointer",Summary:"persisted_nullable"},mutation:{entity:"session",entityKey:"id",op:"upsert",source:"local"},
   queueGates:{blankDirectory:"may_return_before_journal_row",unenrolledProject:"may_return_without_mutation_row",scope:"direct_helper_gates_only",durableSync:false,enrollmentProtocol:"UNPROVED",remoteDelivery:"UNPROVED"}
  }
 }
});
const storeFixture=()=>loadCheckedInMemorySessionStore();
const storeTuples=(item:any)=>item.evidence.map((entry:any)=>[entry.sourceId,entry.startLine,entry.endLine]);

test("session store expects resume selection as the eleventh contract",()=>{
 assert.equal(storeFixture().cases[10]?.id,"SES-store-resume-selection");
});

test("session store expects end terminal upsert as the twelfth contract",()=>{
 assert.equal(storeFixture().cases[11]?.id,"SES-store-end-terminal-upsert");
});

test("session store requires the complete withTx definition",()=>{
 const input=storeFixture(),terminal=input.cases[11];
 terminal.evidence[2].endLine=9335;
 assert.notDeepEqual(validateMemorySessionStore(input),[],"withTx closing brace truncation accepted");
});

test("session store pins leading-zero live tie retention",()=>{
 const resume=storeFixture().cases[10].criticalValues;
 assert.deepEqual({
  leadingZeros:resume.suffix.leadingZeros,
  comparison:resume.selection.liveReplacementComparison,
  tie:resume.selection.numericTie,
  example:resume.selection.tieExample
 },{
  leadingZeros:"accepted",
  comparison:"strict_numeric_less_than",
  tie:"retain_first_source_declared_BINARY_ordered_live_ID",
  example:{first:"root+:resume:02",later:"root+:resume:2",selected:"root+:resume:02"}
 });
 const regressions:[string,(input:any)=>void][]=[
  ["leading zeros rejected",input=>{input.cases[10].criticalValues.suffix.leadingZeros="rejected";}],
  ["tie comparison weakened",input=>{input.cases[10].criticalValues.selection.liveReplacementComparison="numeric_less_than_or_equal";}],
  ["tie retention inverted",input=>{input.cases[10].criticalValues.selection.numericTie="replace_with_later_BINARY_ordered_live_ID";}],
  ["tie example inverted",input=>{input.cases[10].criticalValues.selection.tieExample.selected="root+:resume:2";}]
 ];
 for(const [name,mutate] of regressions){const input=storeFixture();mutate(input);assert.notDeepEqual(validateMemorySessionStore(input),[],`${name} accepted`);}
 assert.equal(Object.isFrozen(expectedSessionStore.facts.resumeSelection.suffix),true);assert.equal(Object.isFrozen(expectedSessionStore.facts.resumeSelection.selection.tieExample),true);
});

test("session store fixture independently pins exactly twelve contracts, one source, and critical facts",()=>{
 const fixture=storeFixture(),id=fixture.cases[0].criticalValues,sql=fixture.cases[1].criticalValues,source=fixture.sources[0];
 assert.deepEqual(validateMemorySessionStore(fixture),[]);
 assert.deepEqual(fixture.cases.map((item:any)=>item.id),expectedSessionStore.caseIds);
 assert.deepEqual([source.id,source.path,source.bytes,source.sha256,source.gitBlob,source.lineStart,source.lineEnd,source.lineFeeds],expectedSessionStore.source);
 for(const item of fixture.cases)assert.deepEqual(storeTuples(item),expectedSessionStore.evidence[item.id as keyof typeof expectedSessionStore.evidence]);
 assert.deepEqual([id.sentinel.name,id.sentinel.message],expectedSessionStore.facts.idSentinel);
 assert.deepEqual([id.blank.operation,id.blank.comparison],expectedSessionStore.facts.blank);
 assert.deepEqual([id.validation.blank,id.validation.nonblank],expectedSessionStore.facts.validation);
 assert.deepEqual(id.entrypoints.create,expectedSessionStore.facts.createChain);assert.deepEqual(id.entrypoints.start,expectedSessionStore.facts.startChain);
 assert.deepEqual(sql.columns,expectedSessionStore.facts.columns);assert.deepEqual(sql.arguments,expectedSessionStore.facts.arguments);
 assert.deepEqual([sql.conflict.project,sql.conflict.ownershipMode,sql.conflict.directory,sql.conflict.populatedIdentity,sql.conflict.lease],expectedSessionStore.facts.conflict);
 assert.deepEqual([sql.errors.exec,sql.errors.rowsAffected,sql.errors.zeroRows],expectedSessionStore.facts.errors);
 assert.deepEqual([sql.sentinel.name,sql.sentinel.message,sql.sentinel.zeroRows,sql.conflict.where],expectedSessionStore.facts.ended);
 assert.deepEqual(sql.ownershipModes,expectedSessionStore.facts.modes);
 assert.deepEqual([sql.lease.duration,sql.lease.comment],expectedSessionStore.facts.lease);
 assert.deepEqual([sql.whitespace.binding,sql.whitespace.builder],expectedSessionStore.facts.whitespace);
 const ownership=fixture.cases[2].criticalValues,create=fixture.cases[3].criticalValues,sync=fixture.cases[4].criticalValues;
 assert.deepEqual(ownership.validationOrder,expectedSessionStore.facts.ownershipValidation);
 assert.deepEqual([ownership.sentinels.invalidMode,ownership.sentinels.projectRequired,ownership.sentinels.mismatch,ownership.sentinels.ambiguous],expectedSessionStore.facts.ownershipSentinels);
 assert.deepEqual(Object.values(ownership.matrix),expectedSessionStore.facts.ownershipMatrix);assert.deepEqual(ownership.transactionOrder,expectedSessionStore.facts.ownershipOrder);
 assert.deepEqual(create.columns,expectedSessionStore.facts.createColumns);assert.deepEqual(create.arguments,expectedSessionStore.facts.createArguments);assert.deepEqual(Object.values(create.conflict),expectedSessionStore.facts.createConflict);
 assert.deepEqual(sync.ordering,expectedSessionStore.facts.syncOrder);assert.deepEqual(sync.persistedColumns,expectedSessionStore.facts.persistedColumns);assert.deepEqual(sync.payloadFields,expectedSessionStore.facts.payloadFields);
 assert.deepEqual([sync.journal.blankDirectory,sync.journal.unenrolledProject,sync.journal.enrolledProject,sync.helperInvocationDurableSync,sync.cloudDelivery],expectedSessionStore.facts.journal);
 assert.deepEqual(fixture.cases[5].criticalValues,expectedSessionStore.facts.liveConflict);assert.deepEqual(fixture.cases[6].criticalValues,expectedSessionStore.facts.liveRepair);assert.deepEqual(fixture.cases[7].criticalValues,expectedSessionStore.facts.endedClaim);assert.deepEqual(fixture.cases[8].criticalValues,expectedSessionStore.facts.isolationPreflight);assert.deepEqual(fixture.cases[9].criticalValues,expectedSessionStore.facts.selectedIsolation);assert.deepEqual(fixture.cases[10].criticalValues,expectedSessionStore.facts.resumeSelection);assert.deepEqual(fixture.cases[11].criticalValues,expectedSessionStore.facts.endTerminalUpsert);
 assert.equal(Object.isFrozen(expectedSessionStore.evidence["SES-store-ended-legacy-ownership-claim"]),true);assert.equal(Object.isFrozen(expectedSessionStore.evidence["SES-store-isolation-root-preflight"]),true);assert.equal(Object.isFrozen(expectedSessionStore.evidence["SES-store-isolation-selected-continuation"]),true);assert.equal(Object.isFrozen(expectedSessionStore.evidence["SES-store-isolation-selected-continuation"][2]),true);assert.equal(Object.isFrozen(expectedSessionStore.evidence["SES-store-resume-selection"]),true);assert.equal(Object.isFrozen(expectedSessionStore.evidence["SES-store-resume-selection"][1]),true);assert.equal(Object.isFrozen(expectedSessionStore.evidence["SES-store-end-terminal-upsert"]),true);assert.equal(Object.isFrozen(expectedSessionStore.evidence["SES-store-end-terminal-upsert"][5]),true);assert.equal(Object.isFrozen(expectedSessionStore.facts.endedClaim.update.arguments),true);assert.equal(Object.isFrozen(expectedSessionStore.facts.isolationPreflight.preflight.trimmedNonblank),true);assert.equal(Object.isFrozen(expectedSessionStore.facts.selectedIsolation.selectedCheck.trimmedNonblank),true);assert.equal(Object.isFrozen(expectedSessionStore.facts.resumeSelection.selection),true);assert.equal(Object.isFrozen(expectedSessionStore.facts.resumeSelection.errors.order),true);assert.equal(Object.isFrozen(expectedSessionStore.facts.endTerminalUpsert.transaction.errors),true);assert.equal(Object.isFrozen(expectedSessionStore.facts.endTerminalUpsert.queueGates),true);
});

test("session store rejects absence, substitution, range, and order changes for every direct tuple",()=>{
 const fixture=storeFixture();
 for(const caseId of expectedSessionStore.caseIds){
  const tuples=expectedSessionStore.evidence[caseId as keyof typeof expectedSessionStore.evidence];
  for(let index=0;index<tuples.length;index++)for(const mode of ["remove","substitute","alter"]){
   const input=structuredClone(fixture),item=input.cases.find((candidate:any)=>candidate.id===caseId);
   if(mode==="remove")item.evidence.splice(index,1);
   else if(mode==="substitute"){const replacement=tuples[(index+1)%tuples.length]!;item.evidence[index]={sourceId:replacement[0],startLine:replacement[1],endLine:replacement[2]};}
   else item.evidence[index].endLine++;
   assert.notDeepEqual(validateMemorySessionStore(input),[],`${mode} accepted ${caseId}:${index}`);
  }
  const reordered=structuredClone(fixture),item=reordered.cases.find((candidate:any)=>candidate.id===caseId);item.evidence.reverse();assert.notDeepEqual(validateMemorySessionStore(reordered),[],`order accepted ${caseId}`);
 }
 const resetCitation=structuredClone(fixture),ended=resetCitation.cases.find((candidate:any)=>candidate.id==="SES-store-ended-legacy-ownership-claim");
 ended.evidence[3].endLine=3222;
 assert.notDeepEqual(validateMemorySessionStore(resetCitation),[],"ended claim callback-reset citation accepted truncated end line 3222");
});

test("session store validator rejects every critical fact, limitation, identity, schema, and overclaim mutation",()=>{
 const fixture=storeFixture(),accepted:string[]=[],mutateLeaves=(value:any,visit:(path:(string|number)[])=>void,path:(string|number)[]=[]):void=>{
  if(value&&typeof value==="object")for(const [key,nested] of Object.entries(value))mutateLeaves(nested,visit,[...path,key]);else visit(path);
 },set=(root:any,path:(string|number)[])=>{let owner=root;for(const key of path.slice(0,-1))owner=owner[key];const key=path.at(-1)!;owner[key]=typeof owner[key]==="boolean"?!owner[key]:typeof owner[key]==="number"?owner[key]+1:`${owner[key]}_altered`;};
 for(const caseIndex of [5,6,7,8,9,10,11])mutateLeaves(fixture.cases[caseIndex].criticalValues,path=>{const input=structuredClone(fixture);set(input.cases[caseIndex].criticalValues,path);assert.notDeepEqual(validateMemorySessionStore(input),[],`critical leaf accepted ${caseIndex}:${path.join(".")}`);});
 for(let index=0;index<fixture.limitations.length;index++){const input=structuredClone(fixture);input.limitations[index]="altered limitation";assert.notDeepEqual(validateMemorySessionStore(input),[],`limitation accepted ${index}`);}
 const mutations:[string,(input:any)=>void][]=[
  ["git blob",input=>{input.sources[0].gitBlob="0".repeat(40);}], ["source hash",input=>{input.sources[0].sha256="0".repeat(64);}], ["representation",input=>{input.sources[0].representation="checkout";}],
  ["line facts",input=>{input.sources[0].lineFeeds++;}], ["status",input=>{input.status="FULL";}], ["case order",input=>{input.cases.reverse();}],
  ["blank rule",input=>{input.cases[0].criticalValues.blank.operation="strings.Trim";}], ["ID sentinel",input=>{input.cases[0].criticalValues.sentinel.message="id required";}],
  ["create chain",input=>{input.cases[0].criticalValues.entrypoints.create.shift();}], ["start chain",input=>{input.cases[0].criticalValues.entrypoints.start.pop();}],
  ["columns",input=>{input.cases[1].criticalValues.columns.reverse();}], ["arguments",input=>{input.cases[1].criticalValues.arguments[4]="datetime('now')";}],
  ["project conflict",input=>{input.cases[1].criticalValues.conflict.project="overwrite";}], ["directory conflict",input=>{input.cases[1].criticalValues.conflict.directory="overwrite";}],
  ["populated identity",input=>{input.cases[1].criticalValues.conflict.populatedIdentity="overwrite";}], ["lease update",input=>{input.cases[1].criticalValues.conflict.lease="preserve";}],
  ["exec error",input=>{input.cases[1].criticalValues.errors.exec="swallow";}], ["rows error",input=>{input.cases[1].criticalValues.errors.rowsAffected="swallow";}], ["zero rows",input=>{input.cases[1].criticalValues.errors.zeroRows="nil";}],
  ["ownership",input=>{input.cases[1].criticalValues.ownershipModes.push("private");}], ["whitespace",input=>{input.cases[1].criticalValues.whitespace.builder="ASCII";}],
  ["ownership validation order",input=>{input.cases[2].criticalValues.validationOrder.reverse();}], ["mismatch sentinel",input=>{input.cases[2].criticalValues.sentinels.mismatch="allow";}],
  ["shared ownership",input=>{input.cases[2].criticalValues.matrix.differentOwnerExistingSharedRequestedShared="ErrSessionOwnershipMismatch";}], ["unclassified ownership",input=>{input.cases[2].criticalValues.matrix.differentOwnerUnclassifiedRequestedShared="allow";}],
  ["ownership transaction order",input=>{input.cases[2].criticalValues.transactionOrder.reverse();}], ["normalization internals",input=>{input.cases[2].criticalValues.normalization="algorithm_proved";}],
  ["create columns",input=>{input.cases[3].criticalValues.columns.reverse();}], ["create arguments",input=>{input.cases[3].criticalValues.arguments[5]="raw_project";}],
  ["create blank-only",input=>{input.cases[3].criticalValues.conflict.directory="overwrite";}], ["creation project",input=>{input.cases[3].criticalValues.localCreationProject="raw_project";}], ["create error",input=>{input.cases[3].criticalValues.errors.exec="swallow";}],
  ["sync transaction",input=>{input.cases[4].criticalValues.transaction.scope="separate_transactions";}], ["sync order",input=>{input.cases[4].criticalValues.ordering.reverse();}], ["persisted columns",input=>{input.cases[4].criticalValues.persistedColumns.shift();}],
  ["payload source",input=>{input.cases[4].criticalValues.payloadSource="request_arguments";}], ["blank directory",input=>{input.cases[4].criticalValues.journal.blankDirectory="row";}], ["unenrolled",input=>{input.cases[4].criticalValues.journal.unenrolledProject="row";}],
  ["durable sync",input=>{input.cases[4].criticalValues.helperInvocationDurableSync=true;}], ["cloud delivery",input=>{input.cases[4].criticalValues.cloudDelivery="PROVED";}],
  ["runtime claim",input=>{input.limitations[2]="Actual SQLite execution is proved.";}], ["auth claim",input=>{input.limitations[3]="Ownership proves tenant authentication.";}],
  ["normalization claim",input=>{input.limitations[6]="NormalizeProject internals are proved.";}], ["sync claim",input=>{input.limitations[7]="Journal insertion proves durable synchronization.";}],
  ["schema",input=>{input.cases[0].unexpected=true;}], ["source schema",input=>{input.sources[0].unexpected=true;}]
 ];
 for(const [name,mutate] of mutations){const input=structuredClone(fixture);mutate(input);if(validateMemorySessionStore(input).length===0)accepted.push(name);}
 assert.deepEqual(accepted,[],`accepted altered store contracts: ${accepted.join(", ")}`);
});

test("CLI rejects flags instead of implying a live verifier",()=>{
 const result=spawnSync(process.execPath,[resolve("scripts/audit-memory-parity.mjs"),"--live"],{encoding:"utf8"});
 assert.equal(result.status,2);
 assert.match(result.stderr,/offline-only and accepts no flags/);
});
