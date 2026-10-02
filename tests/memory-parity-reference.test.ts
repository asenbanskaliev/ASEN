import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {resolve} from "node:path";
import test from "node:test";
// @ts-expect-error Dependency-free offline JavaScript validator.
import {loadCheckedInMemoryFoundation,loadCheckedInMemoryObservationWrites,loadCheckedInMemoryParity,loadCheckedInMemoryRetrievalSearch,validateMemoryFoundation,validateMemoryObservationWrites,validateMemoryParity,validateMemoryRetrievalSearch} from "../scripts/audit-memory-parity.mjs";

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

test("CLI rejects flags instead of implying a live verifier",()=>{
 const result=spawnSync(process.execPath,[resolve("scripts/audit-memory-parity.mjs"),"--live"],{encoding:"utf8"});
 assert.equal(result.status,2);
 assert.match(result.stderr,/offline-only and accepts no flags/);
});
