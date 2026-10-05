import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error The dependency-free validator is intentionally a JavaScript CLI module.
import {loadCheckedInSkillContractParity,validateSkillContractParity} from "../scripts/validate-skill-contract-parity.mjs";

type Source={id:string;kind:string;path:string;status:string;bytes:number|null;sha256:string|null};
type SkillParityInput={
 manifest:{baseline:{commit:string};sources:Source[]};
 matrix:Record<string,any>;
 existingPaths:Set<string>;
 capabilityStatus:string;
};

const clone=(input:SkillParityInput):SkillParityInput=>structuredClone(input);
const errors=(input:SkillParityInput):string[]=>validateSkillContractParity(input);
const expectError=(input:SkillParityInput,pattern:RegExp)=>assert.match(errors(input).join("\n"),pattern);

const baseline=loadCheckedInSkillContractParity();

test("checked-in strict Skill parity contracts are valid",()=>{
 assert.deepEqual(errors(baseline),[]);
});

test("requires exactly 12 unique source Skills",()=>{
 const input=clone(baseline);
 input.manifest.sources=input.manifest.sources.filter((source,index)=>source.kind!=="skill"||index!==0);
 expectError(input,/exactly 12 unique source Skills/);
});

test("requires every declared source reference to resolve to a document",()=>{
 const input=clone(baseline);
 input.matrix.contracts[0].sourceReferences=["SRC-SUPPORT-999"];
 expectError(input,/unknown source reference SRC-SUPPORT-999/);
});

test("validates present and absent document metadata",()=>{
 for(const mutate of [
  (input:SkillParityInput)=>{input.manifest.sources[0]!.sha256="bad";},
  (input:SkillParityInput)=>{input.manifest.sources[0]!.bytes=null;},
  (input:SkillParityInput)=>{input.manifest.sources.at(-1)!.sha256="a".repeat(64);}
 ]){
  const input=clone(baseline);mutate(input);
  expectError(input,/document metadata/);
 }
});

test("rejects silently omitted support contracts",()=>{
 const input=clone(baseline);
 input.manifest.sources=input.manifest.sources.filter(source=>source.id!=="SRC-SUPPORT-003");
 expectError(input,/missing support contract/);
});

test("requires the matrix source commit",()=>{
 const input=clone(baseline);
 delete input.matrix.sourceCommit;
 expectError(input,/source commit/);
});

test("requires a valid lowercase matrix source commit",()=>{
 for(const sourceCommit of ["","abc",baseline.matrix.sourceCommit.toUpperCase()]){
  const input=clone(baseline);
  input.matrix.sourceCommit=sourceCommit;
  expectError(input,/40-character lowercase Git SHA/);
 }
});

test("rejects a source commit mismatch",()=>{
 const input=clone(baseline);
 input.matrix.sourceCommit="f".repeat(40);
 expectError(input,/source commit/);
});

test("requires every behavioral contract dimension",()=>{
 for(const dimension of ["activation","hardRules","decisionGates","outputs","prohibited"]){
  const input=clone(baseline);
  input.matrix.rows[0][dimension]=[];
  expectError(input,new RegExp(`nonempty ${dimension}`));
 }
});

test("allows only FULL, PARTIAL, and MISSING",()=>{
 const input=clone(baseline);
 input.matrix.rows[0].status="N/A";
 expectError(input,/invalid status/);
});

test("requires documented gaps for non-FULL rows",()=>{
 const input=clone(baseline);
 input.matrix.rows[0].gaps=[];
 expectError(input,/PARTIAL requires a documented gap/);
});

test("requires differences to reference declared contract IDs",()=>{
 for(const field of ["gaps","equivalentAdaptations"]){
  const input=clone(baseline);
  input.matrix.rows[0][field][0].contractId="UNKNOWN-001";
  expectError(input,/undeclared contract ID/);
 }
});

test("FULL requires gap-free automated evidence that exists",()=>{
 const full=(evidence:string[],gaps:unknown[]=[])=>{
  const input=clone(baseline);
  Object.assign(input.matrix.rows[0],{status:"FULL",gaps,evidence});
  return input;
 };
 expectError(full(["tests/skill-contract-parity.test.ts"],[{contractId:"BRANCH-GATE-001",note:"gap"}]),/FULL cannot declare gaps/);
 expectError(full([]),/FULL requires evidence/);
 expectError(full(["skills/asen-delivery-branch/SKILL.md"]),/automated evidence/);
 expectError(full(["tests/does-not-exist.test.ts"]),/evidence path does not exist/);
 expectError(full(["docs/audit/pr30-skill-harness-status.md"]),/automated evidence/);
});

test("requires existing ASEN Skill mappings",()=>{
 const input=clone(baseline);
 input.matrix.rows[0].asenSkill="skills/asen-missing/SKILL.md";
 expectError(input,/ASEN Skill does not exist/);
});

test("requires row source IDs to equal the manifest Skill IDs",()=>{
 const input=clone(baseline);
 input.matrix.rows[0].sourceId="SRC-SUPPORT-001";
 expectError(input,/row source IDs must equal/);
});

test("requires the ASEN registry path and forbids legacy registry tokens",()=>{
 const wrong=clone(baseline);wrong.matrix.registryPath=".other/skill-registry.md";
 expectError(wrong,/registryPath/);
 const legacy=clone(baseline);legacy.matrix.contracts[0].requirement+=" .atl/skills.md";
 expectError(legacy,/forbidden legacy registry token/);
});

test("keeps CAP-SKL-001 specified",()=>{
 const input=clone(baseline);input.capabilityStatus="verified";
 expectError(input,/CAP-SKL-001 must remain specified/);
});
