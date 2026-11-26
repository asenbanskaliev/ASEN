import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {verifyT06IndependentReviewInputs,t06ReviewHashes}
 from "../src/runtime/agents/t06-independent-review-admission.js";

const sha="a".repeat(40);
const names=["t06-writer-a.mjs","t06-writer-b.mjs"] as const;
const files:Record<string,Buffer>={
 "t06-writer-a.mjs":Buffer.from("export function sumEvenNumbers(x){return 2;}\n"),
 "t06-writer-b.mjs":Buffer.from("export function normalizeNames(x){return [];}\n")
};
const hash=(data:Buffer)=>createHash("sha256").update(data).digest("hex");
const writerReport=()=>({
 schema:"asen.t06.native-dual-writer/v1",sha,
 staticOnly:true,concurrent:true,
 result:"PASS_TWO_WRITERS_STATIC_ONLY_BEHAVIOR_NOT_TESTED",
 generatedCodeExecuted:false,behaviorVerified:false,accepted:false,globalFull:false,
 workers:names.map((name,i)=>({
  worker:i===0?"t06-writer-a":"t06-writer-b",scope:name,
  writeOnlyVerified:true,behaviorVerified:false,syntaxOk:true,
  exactScope:true,attributionVerified:true,writeToolObserved:true,
  writeStarts:1,writeSuccesses:1,writeFailures:0,fileSha256:hash(files[name]!)
 }))
});
const manifest=()=>({
 schema:"asen.t06.behavior-handoff/v1",sha,
 behaviorVerified:false,acceptance:"not-accepted",globalFull:false,
 files:names.map(name=>({name,sha256:hash(files[name]!)}))
});
const behavior=()=>({
 schema:"asen.t06.isolated-behavior/v1",sha,
 status:"candidate-behavior-passed",networkDisabled:true,
 providerSecretsAbsent:true,behaviorVerified:true,isolated:true,
 accepted:false,globalFull:false,providerUsageVerified:false,billingVerified:false,
 independentlyReviewed:false,
 writers:names.map((name,i)=>({
  name,verified:true,completed:i===0?9:8,reason:"casos-externos-superados"
 }))
});
const check=(patch:Record<string,unknown>={})=>
 verifyT06IndependentReviewInputs({
  expectedSha:sha,report:writerReport(),manifest:manifest(),
  files,behavior:behavior(),...patch
 });

test("T06 deja revisar solamente si se completaron los 17 casos externos y huellas",()=>{
 const result=check();
 assert.equal(result.allowed,true);
 assert.equal(result.globalFull,false);
 assert.deepEqual(t06ReviewHashes(files),{
  "t06-writer-a.mjs":hash(files[names[0]]!),
  "t06-writer-b.mjs":hash(files[names[1]]!)
 });
});
test("T06 deniega prueba con un solo archivo, red abierta o secreto en contenedor",()=>{
 for(const modified of [
  {...behavior(),networkDisabled:false},
  {...behavior(),providerSecretsAbsent:false},
  {...behavior(),isolated:false},
  {...behavior(),behaviorVerified:false},
  {...behavior(),status:"blocked"},
  {...behavior(),accepted:true},
  {...behavior(),globalFull:true},
  {...behavior(),sha:"b".repeat(40)},
  {...behavior(),writers:[behavior().writers[0]]},
  {...behavior(),writers:[{...behavior().writers[0],completed:8},behavior().writers[1]]},
  {...behavior(),writers:[behavior().writers[0],{...behavior().writers[1],verified:false}]},
  {...behavior(),writers:[{...behavior().writers[0],reason:"proceso-incompleto"},behavior().writers[1]]}
 ])assert.equal(check({behavior:modified}).allowed,false,JSON.stringify(modified));
});
test("T06 rechaza informe Writer sin simultaneidad y bytes cambiados",()=>{
 assert.equal(check({report:{...writerReport(),concurrent:false}}).allowed,false);
 assert.equal(check({report:{...writerReport(),result:"BLOCKED_OR_PARTIAL_NEEDS_REVIEW"}}).allowed,false);
 assert.equal(check({files:{...files,[names[0]]:Buffer.from("manipulado")}}).allowed,false);
 assert.equal(check({expectedSha:"b".repeat(40)}).allowed,false);
});
