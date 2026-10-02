import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {resolve} from "node:path";
import test from "node:test";
// @ts-expect-error Dependency-free offline JavaScript validator.
import {loadCheckedInMemoryParity,validateMemoryParity} from "../scripts/audit-memory-parity.mjs";

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

test("CLI rejects flags instead of implying a live verifier",()=>{
 const result=spawnSync(process.execPath,[resolve("scripts/audit-memory-parity.mjs"),"--live"],{encoding:"utf8"});
 assert.equal(result.status,2);
 assert.match(result.stderr,/offline-only and accepts no flags/);
});
