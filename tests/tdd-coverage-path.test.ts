import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,realpathSync,rmSync,symlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {executeNodeCoverageObservation} from "../src/test/tdd-observation.js";
import {commitCandidateFiles,gitCandidate} from "./execution-evidence-helper.js";

test("V8 coverage from a temporary directory alias stays bound to the candidate",async t=>{
 const initial=gitCandidate("coverage-path-alias");t.after(()=>rmSync(initial.repository,{recursive:true,force:true}));
 const behavior="export function classify(value){if(value==='yes'){return 1;}return 2;}\n",testFile="import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {classify} from '../src/classify.mjs';const external=await import(pathToFileURL(process.env.ASEN_COVERAGE_EXTERNAL_SCRIPT).href);test('accepts yes',()=>{external.touch();assert.equal(classify('yes'),1)});\n";
 const candidate=commitCandidateFiles(initial,{"src/classify.mjs":behavior,"tests/classify.test.mjs":testFile});
 const root=mkdtempSync(join(tmpdir(),"asen-coverage-alias-")),alias=join(root,"temporary-alias"),externalRoot=mkdtempSync(join(tmpdir(),"asen-coverage-external-")),externalScript=join(externalRoot,"outside.mjs");writeFileSync(externalScript,"export function touch(){return 'external';}\n");t.after(()=>{rmSync(root,{recursive:true,force:true});rmSync(externalRoot,{recursive:true,force:true});});
 symlinkSync(root,alias,process.platform==="win32"?"junction":"dir");assert.notEqual(alias,realpathSync(alias));
 const names=["TMPDIR","TMP","TEMP","ASEN_COVERAGE_EXTERNAL_SCRIPT"] as const,prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 try{
  for(const name of names)process.env[name]=name==="ASEN_COVERAGE_EXTERNAL_SCRIPT"?externalScript:alias;
  const observation=await executeNodeCoverageObservation(candidate,["tests/classify.test.mjs"],["accepts yes"],["src/classify.mjs"]);
  assert.deepEqual(observation.plannedCaseIds,["accepts yes"]);
  assert.deepEqual(observation.cases[0]?.behavior.map(item=>item.path),["src/classify.mjs"]);
  assert.ok((observation.cases[0]?.behavior[0]?.ranges.length??0)>0);
 }finally{
  for(const name of names){const value=prior[name];if(value===undefined)delete process.env[name];else process.env[name]=value;}
 }
});
