import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Dependency-free offline JavaScript registry.
import {loadCheckedInMemoryObservationPin,validateMemoryObservationPin,writerBParitySlices} from "../scripts/memory-parity/writer-b/index.mjs";

const root=process.cwd();
const clone=(value:any)=>structuredClone(value);
const errors=(value:unknown):string[]=>validateMemoryObservationPin(value);
const reject=(baseline:any,mutate:(input:any)=>void)=>{const input=clone(baseline);mutate(input);assert.notDeepEqual(errors(input),[]);};
const deeplyFrozen=(value:any):boolean=>!value||typeof value!=="object"||(Object.isFrozen(value)&&Object.values(value).every(deeplyFrozen));

test("writer B exposes one callable frozen observation-pin descriptor",()=>{
 assert.equal(Object.isFrozen(writerBParitySlices),true);assert.equal(writerBParitySlices.length,1);
 const descriptor=writerBParitySlices[0];
 assert.equal(Object.isFrozen(descriptor),true);
 assert.deepEqual(Object.keys(descriptor).sort(),["fixturePath","id","load","successLabel","validate"]);
 assert.equal(descriptor.fixturePath,"registry/parity/memory-observation-pin-contracts-v1.json");
 assert.equal(typeof descriptor.load,"function");assert.equal(typeof descriptor.validate,"function");
 for(const malformed of [null,undefined,0,"",[],{},Object.create(null)])assert.ok(descriptor.validate(malformed).every((issue:unknown)=>typeof issue==="string"));
});

test("checked-in contract is one source-inspected case with exact ordered leaves",()=>{
 const fixture=loadCheckedInMemoryObservationPin(root);
 assert.deepEqual(errors(fixture),[]);assert.equal(deeplyFrozen(fixture),true);
 assert.equal(fixture.scope,"reference_only");assert.equal(fixture.status,"SOURCE_INSPECTED");assert.equal(fixture.proofKind,"source_inspection");
 assert.equal(fixture.sources.length,1);assert.equal(fixture.cases.length,1);
 assert.deepEqual(fixture.cases[0].evidence.map((item:any)=>[item.startLine,item.endLine]),[[63,63],[3932,3957]]);
 assert.deepEqual(fixture.cases[0].evidence[1].symbols,["PinObservation","UnpinObservation","setObservationPinned"]);
 assert.equal(fixture.cases[0].facts.length,8);assert.equal(Object.keys(fixture.cases[0].criticalValues).length,8);
 assert.equal(fixture.limitations.length,8);
});

test("rejects source identity and tuple removal, shrink, substitution, reorder, or duplication",()=>{
 const fixture=loadCheckedInMemoryObservationPin(root);
 for(const mutate of [
  (x:any)=>x.sources.pop(),(x:any)=>x.sources.push(clone(x.sources[0])),(x:any)=>x.sources[0].commit="0".repeat(40),
  (x:any)=>x.sources[0].mode="100755",(x:any)=>x.sources[0].blob="0".repeat(40),(x:any)=>x.sources[0].sha256="0".repeat(64),
  (x:any)=>x.sources[0].bytes--,(x:any)=>x.sources[0].lf--,(x:any)=>x.sources[0].path="store.go",
  (x:any)=>x.cases[0].evidence.pop(),(x:any)=>x.cases[0].evidence[1].endLine=3956,(x:any)=>x.cases[0].evidence[1].startLine=3931,
  (x:any)=>x.cases[0].evidence.reverse(),(x:any)=>x.cases[0].evidence.push(clone(x.cases[0].evidence[1])),
  (x:any)=>x.cases[0].evidence[0].neighbors.after="substitute"
 ])reject(fixture,mutate);
});

test("rejects operation, SQL, argument, error, fact, and critical-leaf changes",()=>{
 const fixture=loadCheckedInMemoryObservationPin(root);
 for(const mutate of [
  (x:any)=>x.cases[0].criticalValues.pinDelegates.pinned=false,(x:any)=>x.cases[0].criticalValues.unpinDelegates.pinned=true,
  (x:any)=>x.cases[0].criticalValues.integerMapping.reverse(),(x:any)=>x.cases[0].criticalValues.sql+=" ",
  (x:any)=>x.cases[0].criticalValues.arguments.reverse(),(x:any)=>x.cases[0].criticalValues.execution.method="exec",
  (x:any)=>x.cases[0].criticalValues.errors.execution="wrapped",(x:any)=>x.cases[0].criticalValues.errors.rowsAffected="wrapped",
  (x:any)=>x.cases[0].criticalValues.errors.zeroRows="nil",(x:any)=>x.cases[0].criticalValues.errors.nonzeroRows="error",
  (x:any)=>x.cases[0].criticalValues.mutation.changedColumns.push("updated_at"),(x:any)=>x.cases[0].criticalValues.mutation.predicates.pop(),
  (x:any)=>x.cases[0].facts.pop(),(x:any)=>x.cases[0].facts.reverse(),(x:any)=>x.cases[0].facts[0]="PinObservation mutates directly."
 ])reject(fixture,mutate);
});

test("rejects altered limitations, unknown properties, and runtime or FULL claims",()=>{
 const fixture=loadCheckedInMemoryObservationPin(root);
 for(const mutate of [
  (x:any)=>x.limitations.pop(),(x:any)=>x.limitations.reverse(),(x:any)=>x.limitations[0]="Source inspection proves driver behavior.",
  (x:any)=>x.extra=true,(x:any)=>x.sources[0].extra=true,(x:any)=>x.cases[0].criticalValues.extra=true,
  (x:any)=>x.status="FULL",(x:any)=>x.proofKind="runtime_test",(x:any)=>x.runtimeParity=true,(x:any)=>x.cases.push(clone(x.cases[0]))
 ])reject(fixture,mutate);
});
