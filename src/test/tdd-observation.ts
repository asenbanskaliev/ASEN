import { createHash } from "node:crypto";
import type { Candidate } from "../core/types.js";
import { executeCapturedEvidenceCommand, type ExecutedEvidence } from "../evidence/execution.js";

export interface TestObservation {
  readonly adapterId: "node-test";
  readonly commandFingerprint: string;
  readonly testPaths: readonly string[];
  readonly executedCaseIds: readonly string[];
  readonly failingCaseIds: readonly string[];
  readonly assertionFingerprint: string;
  readonly failureKind: "assertion";
}
export interface PassingTestObservation {
  readonly adapterId: "node-test";
  readonly commandFingerprint: string;
  readonly testPaths: readonly string[];
  readonly executedCaseIds: readonly string[];
  readonly failingCaseIds: readonly [];
}
const issued = new WeakMap<object, ExecutedEvidence>();
const claimed = new WeakSet<object>();
const testPathPattern=/(?:^|\/)[^/]+\.(?:test|spec)\.(?:js|mjs|cjs)$/u;

function text(value:unknown,noun:string):string{
 if(typeof value!=="string"||!value||value.trim()!==value||value!==value.normalize("NFC")||/[\u0000-\u001f\u007f-\u009f]/u.test(value))throw new Error(`${noun} is malformed`);
 return value;
}
function strictTestPaths(value:unknown):string[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||!value.length)throw new Error("test paths must be a nonempty exact array");
 const indexes=Array.from({length:value.length},(_,index)=>String(index)),own=Reflect.ownKeys(value);
 if(own.some(key=>typeof key!=="string"||key!=="length"&&!indexes.includes(key)))throw new Error("test paths must be a nonempty exact array");
 const paths=indexes.map(index=>{
  const descriptor=Object.getOwnPropertyDescriptor(value,index),path=text(descriptor&&"value" in descriptor?descriptor.value:undefined,"test path");
  if(path.startsWith("/")||path.includes("\\")||path.includes(":")||path.split("/").some(part=>!part||part==="."||part==="..")||!testPathPattern.test(path))throw new Error("test path must use the strict JS test filename convention");
  return path;
 });
 if(new Set(paths).size!==paths.length)throw new Error("test paths contain duplicates");
 return paths;
}
function parseTap(stdout:string,passing=false):{executed:string[];failing:string[];fingerprint:string}{
 if(stdout!==stdout.normalize("NFC")||/[\u0000\u007f-\u009f]/u.test(stdout))throw new Error("Node test output is malformed");
 const lines=stdout.replace(/\r\n/gu,"\n").split("\n"),results:Array<{name:string;failed:boolean;diagnostic:string[]}>=[];
 for(let index=0;index<lines.length;index++){
  const match=/^(not )?ok \d+ - (.+)$/u.exec(lines[index]!);
  if(!match)continue;
  const name=text(match[2]!,"test case id");
  if(/ # (?:SKIP|TODO)/u.test(name))throw new Error("skipped or todo tests cannot establish strict TDD");
  const diagnostic:string[]=[];
  for(index++;index<lines.length&&!/^(?:not )?ok \d+ - /u.test(lines[index]!);index++)diagnostic.push(lines[index]!);
  index--;results.push({name,failed:Boolean(match[1]),diagnostic});
 }
 const summary=(label:string)=>{const line=lines.find(item=>item.startsWith(`# ${label} `));return line?Number(line.slice(label.length+3)):NaN;};
 const failing=results.filter(result=>result.failed);
 if(!results.length||summary("tests")!==results.length||summary("fail")!==failing.length||passing&&(failing.length||summary("skipped")!==0||summary("todo")!==0)||!passing&&!failing.length)throw new Error(`Node TAP did not report discovered ${passing?"passing":"failing"} tests`);
 if(new Set(results.map(result=>result.name)).size!==results.length)throw new Error("Node TAP case ids are not unique");
 const assertions=failing.map(result=>{
  const field=(key:string)=>{const index=result.diagnostic.findIndex(line=>new RegExp(`^\\s+${key}:`).test(line));if(index<0)return undefined;const line=result.diagnostic[index]!,indent=line.search(/\S/u),values=[line.slice(line.indexOf(":")+1).trim()];for(let next=index+1;next<result.diagnostic.length&&result.diagnostic[next]!.search(/\S/u)>indent;next++)values.push(result.diagnostic[next]!.trimEnd());return values;};
  const name=field("name"),code=field("code"),expected=field("expected"),actual=field("actual"),operator=field("operator");
  if(name?.[0]!=="'AssertionError'"||code?.[0]!=="'ERR_ASSERTION'"||!operator?.[0]||!expected||!actual)throw new Error("Node test failure was not an assertion");
  return {caseId:result.name,code,name,expected,actual,operator};
 });
 return {executed:results.map(result=>result.name),failing:failing.map(result=>result.name),fingerprint:createHash("sha256").update(JSON.stringify(assertions)).digest("hex")};
}

/** Executes the fixed local Node test runner and records only parsed, stable assertion facts. */
export async function executeNodeTestObservation(candidate:Candidate,testPaths:readonly string[]):Promise<TestObservation>{
 const paths=strictTestPaths(testPaths),command=[process.execPath,"--test","--test-reporter=tap",...paths] as [string,...string[]];
 const {proof,stdout,stderr}=await executeCapturedEvidenceCommand(candidate,command,{cwd:candidate.repository,timeoutMs:120000});
 if(proof.exitCode===0)throw new Error("Node test observation requires a failing test run");
 if(stderr.trim())throw new Error("Node test runner emitted unexpected stderr");
 const parsed=parseTap(stdout);
 const observation=Object.freeze({adapterId:"node-test" as const,commandFingerprint:createHash("sha256").update(JSON.stringify(proof.command)).digest("hex"),testPaths:Object.freeze(paths),executedCaseIds:Object.freeze(parsed.executed),failingCaseIds:Object.freeze(parsed.failing),assertionFingerprint:parsed.fingerprint,failureKind:"assertion" as const});
 issued.set(observation,proof);return observation;
}
export async function executeNodePassingObservation(candidate:Candidate,testPaths:readonly string[]):Promise<PassingTestObservation>{
 const paths=strictTestPaths(testPaths),command=[process.execPath,"--test","--test-reporter=tap",...paths] as [string,...string[]];
 const {proof,stdout,stderr}=await executeCapturedEvidenceCommand(candidate,command,{cwd:candidate.repository,timeoutMs:120000});
 if(proof.exitCode!==0||stderr.trim())throw new Error("Node passing observation requires a clean test run");
 const parsed=parseTap(stdout,true);if(parsed.executed.some(caseId=>{const normalized=caseId.replace(/\\/gu,"/");return testPathPattern.test(normalized)||paths.some(item=>normalized===item||normalized.endsWith(`/${item}`));}))throw new Error("Node TAP did not report an executed test case");
 const observation=Object.freeze({adapterId:"node-test" as const,commandFingerprint:createHash("sha256").update(JSON.stringify(proof.command)).digest("hex"),testPaths:Object.freeze(paths),executedCaseIds:Object.freeze(parsed.executed),failingCaseIds:Object.freeze([]) as readonly []});
 issued.set(observation,proof);return observation;
}
function claim(value:unknown,noun:string):ExecutedEvidence{
 if(typeof value!=="object"||value===null||!issued.has(value))throw new Error(`${noun} was not issued here`);
 if(claimed.has(value))throw new Error(`${noun} has already been claimed`);
 claimed.add(value);return issued.get(value)!;
}
export function claimTestObservation(value:unknown):ExecutedEvidence{return claim(value,"test observation");}
export function claimPassingTestObservation(value:unknown):ExecutedEvidence{return claim(value,"passing test observation");}
