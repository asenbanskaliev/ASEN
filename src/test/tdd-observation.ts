import { createHash } from "node:crypto";
import {realpathSync} from "node:fs";
import {isAbsolute,relative,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import type { Candidate } from "../core/types.js";
import { executeCapturedEvidenceCommand,executeNodeCoverageCommand, type ExecutedEvidence } from "../evidence/execution.js";

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
export interface NodeCoverageObservation {
 readonly adapterId:"node-test-v8";readonly commandFingerprint:string;
 readonly candidate:Readonly<{id:string;repository:string;revision:string}>;readonly testPaths:readonly string[];readonly plannedCaseIds:readonly string[];
 readonly cases:readonly Readonly<{caseId:string;behavior:readonly Readonly<{path:string;ranges:readonly Readonly<{startOffset:number;endOffset:number}>[]}>[]}>[];
}
const issued = new WeakMap<object, ExecutedEvidence>();
const claimed = new WeakSet<object>();
const issuedCoverage=new WeakMap<object,{proofs:readonly ExecutedEvidence[]}>(),claimedCoverage=new WeakSet<object>();
const testPathPattern=/(?:^|\/)[^/]+\.(?:test|spec)\.(?:js|mjs|cjs)$/u;

function hasControls(value:string,allowNewlines=false):boolean{return [...value].some(character=>{const code=character.charCodeAt(0);return code<32&&(!allowNewlines||code!==10&&code!==13)||code>=127&&code<=159;});}
function text(value:unknown,noun:string):string{
 if(typeof value!=="string"||!value||value.trim()!==value||value!==value.normalize("NFC")||hasControls(value))throw new Error(`${noun} is malformed`);
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
 if(stdout!==stdout.normalize("NFC")||hasControls(stdout,true))throw new Error("Node test output is malformed");
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

function same(first:readonly string[],second:readonly string[]):boolean{return first.length===second.length&&first.every((item,index)=>item===second[index]);}
function strictTexts(value:unknown,noun:string):string[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||!value.length)throw new Error(`${noun} must be a nonempty exact array`);
 const indexes=Array.from({length:value.length},(_,index)=>String(index)),own=Reflect.ownKeys(value);if(own.some(key=>typeof key!=="string"||key!=="length"&&!indexes.includes(key))||indexes.some(index=>!Object.hasOwn(value,index)))throw new Error(`${noun} must be a nonempty exact array`);const result=indexes.map(index=>text(Object.getOwnPropertyDescriptor(value,index)?.value,noun.slice(0,-1)));if(new Set(result).size!==result.length)throw new Error(`${noun} must be unique exact values`);return result;
}
function repositoryPaths(value:unknown,noun:string):string[]{return strictTexts(value,noun).map(item=>{if(item.startsWith("/")||item.includes("\\")||item.includes(":")||item.split("/").some(part=>!part||part==="."||part===".."))throw new Error(`${noun} must be canonical repository paths`);return item;});}
function filteredTap(stdout:string,target:string,planned:readonly string[]):void{
 const lines=stdout.replace(/\r\n/gu,"\n").split("\n"),seen:string[]=[];let targetPass=0;
 for(const line of lines){const match=/^(not )?ok \d+ - (.*?)(?: # (SKIP|TODO).*)?$/u.exec(line);if(!match)continue;const name=text(match[2]!,"test case id");if(!planned.includes(name))throw new Error("filtered Node TAP reported an unexpected case");seen.push(name);if(name===target&&!match[1]&&!match[3])targetPass++;else if(match[3]!=="SKIP")throw new Error("filtered Node TAP did not isolate the target case");}
 const summary=(label:string)=>Number(lines.find(line=>line.startsWith(`# ${label} `))?.slice(label.length+3));if(targetPass!==1||new Set(seen).size!==seen.length||summary("tests")!==seen.length||summary("fail")!==0||summary("todo")!==0)throw new Error("filtered Node TAP did not run the target exactly once");
}
type Range={startOffset:number;endOffset:number};type RawRange=Range&{count:number};
function coverageRelativePath(cwd:string,absolute:string,canonicalRoot=realpathSync(cwd)):string|undefined{
 const relativePath=relative(canonicalRoot,absolute).replace(/\\/gu,"/");
 if(isAbsolute(relativePath)||relativePath.startsWith("../")||relativePath==="..")return undefined;
 const expected=resolve(canonicalRoot,relativePath),actual=resolve(absolute);
 if(process.platform==="win32"?expected.toLowerCase()!==actual.toLowerCase():expected!==actual)throw new Error("Node coverage script path is ambiguous");
 return relativePath;
}
function coverageRanges(documents:readonly unknown[],cwd:string,behaviorPaths:readonly string[]):Map<string,Range[]>{
 const found=new Map<string,Range[]>(),observedScripts=new Set<string>();
 for(const document of documents){
  const scripts=(document as {result?:unknown})?.result;
  if(!Array.isArray(scripts))throw new Error("Node coverage output is malformed");
  for(const script of scripts){
   const url=(script as {url?:unknown})?.url,functions=(script as {functions?:unknown})?.functions;
   if(typeof url!=="string"||!Array.isArray(functions))throw new Error("Node coverage output is malformed");
   if(!url.startsWith("file:"))continue;
   let absolute:string;try{absolute=fileURLToPath(url);}catch{throw new Error("Node coverage file URL is malformed");}
   const relativePath=coverageRelativePath(cwd,absolute,cwd);
   observedScripts.add(relativePath??"<outside-root>");
   if(relativePath===undefined||!behaviorPaths.includes(relativePath))continue;
   if(found.has(relativePath))throw new Error("Node coverage contains duplicate or ambiguous behavior scripts");
   const raw:RawRange[]=[];
   for(const fn of functions){
    const ranges=(fn as {ranges?:unknown})?.ranges;if(!Array.isArray(ranges))throw new Error("Node coverage output is malformed");
    for(const range of ranges){
     const entry=range as {startOffset?:unknown;endOffset?:unknown;count?:unknown},startOffset=entry.startOffset,endOffset=entry.endOffset,count=entry.count;
     if(!Number.isSafeInteger(startOffset)||!Number.isSafeInteger(endOffset)||!Number.isSafeInteger(count)||(startOffset as number)<0||(endOffset as number)<=(startOffset as number)||(count as number)<0)throw new Error("Node coverage range is malformed");
     raw.push({startOffset:startOffset as number,endOffset:endOffset as number,count:count as number});
    }
   }
   const edges=[...new Set(raw.flatMap(range=>[range.startOffset,range.endOffset]))].sort((a,b)=>a-b),positive:Range[]=[];
   for(let index=1;index<edges.length;index++){
    const startOffset=edges[index-1]!,endOffset=edges[index]!,covering=raw.filter(range=>range.startOffset<=startOffset&&range.endOffset>=endOffset).sort((a,b)=>(a.endOffset-a.startOffset)-(b.endOffset-b.startOffset));
    const mostSpecific=covering[0];
    if(mostSpecific&&mostSpecific.count>0){const prior=positive.at(-1);if(prior&&prior.endOffset===startOffset)prior.endOffset=endOffset;else positive.push({startOffset,endOffset});}
   }
   found.set(relativePath,positive);
  }
 }
 for(const path of behaviorPaths)if(!found.get(path)?.length){
  const state=found.has(path)?"script-found-with-zero-positive-ranges":"script-not-found";
  const observed=[...observedScripts].sort().slice(0,20).join(",")||"none";
  throw new Error(`Node coverage is missing positive behavior coverage: ${path}; ${state}; observed relative scripts: ${observed}`);
 }
 return found;
}
/** Runs full and per-case fixed Node TAP commands and returns only normalized positive V8 ranges. */
export async function executeNodeCoverageObservation(candidate:Candidate,testPaths:readonly string[],plannedCaseIds:readonly string[],behaviorPaths:readonly string[]):Promise<NodeCoverageObservation>{
 const paths=strictTestPaths(testPaths),cases=strictTexts(plannedCaseIds,"planned case ids"),behaviors=repositoryPaths(behaviorPaths,"behavior paths"),base=[process.execPath,"--test","--test-reporter=tap"];
 const fullCommand=[...base,...paths] as [string,...string[]],full=await executeNodeCoverageCommand(candidate,fullCommand,{cwd:candidate.repository,timeoutMs:120000});if(full.proof.exitCode!==0||full.stderr.trim())throw new Error("coverage observation requires a clean full test run");const parsed=parseTap(full.stdout,true);if(!same(parsed.executed,cases))throw new Error("full Node TAP cases do not exactly match the plan");
 const proofs=[full.proof],observed=[];for(const caseId of cases){const escaped=caseId.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&"),command=[...base,`--test-name-pattern=^${escaped}$`,...paths] as [string,...string[]],run=await executeNodeCoverageCommand(candidate,command,{cwd:candidate.repository,timeoutMs:120000});proofs.push(run.proof);if(run.proof.exitCode!==0||run.stderr.trim())throw new Error("filtered coverage observation requires a clean test run");filteredTap(run.stdout,caseId,cases);const ranges=coverageRanges(run.coverage,run.coverageRoot,behaviors);observed.push(Object.freeze({caseId,behavior:Object.freeze(behaviors.map(path=>Object.freeze({path,ranges:Object.freeze(ranges.get(path)!.map(range=>Object.freeze({...range})))})))}));}
 const observation=Object.freeze({adapterId:"node-test-v8" as const,commandFingerprint:createHash("sha256").update(JSON.stringify(proofs.map(proof=>proof.command))).digest("hex"),candidate:Object.freeze({id:candidate.id,repository:candidate.repository,revision:candidate.revision}),testPaths:Object.freeze(paths),plannedCaseIds:Object.freeze(cases),cases:Object.freeze(observed)});issuedCoverage.set(observation,{proofs:Object.freeze(proofs)});return observation;
}
export function claimNodeCoverageObservation(value:unknown):{proofs:readonly ExecutedEvidence[]}{if(typeof value!=="object"||value===null||!issuedCoverage.has(value))throw new Error("coverage observation was not issued here");if(claimedCoverage.has(value))throw new Error("coverage observation has already been claimed");claimedCoverage.add(value);return issuedCoverage.get(value)!;}
