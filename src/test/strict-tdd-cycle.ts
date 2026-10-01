import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { Candidate } from "../core/types.js";
import { assertExactGitCandidate } from "../evidence/execution.js";
import { assertDirectGitParent } from "../evidence/git-lineage.js";
import { claimTddObligation, type TddObligation } from "../lifecycle/applicability.js";
import { claimPassingTestObservation, claimTestObservation, type PassingTestObservation, type TestObservation } from "./tdd-observation.js";

export interface StrictDecisionPoint { readonly behaviorPath: string; readonly startOffset: number; readonly endOffset: number }
export interface StrictDecisionPath { readonly caseId: string; readonly points: readonly StrictDecisionPoint[] }
export type StrictTriangulationPolicy =
  | Readonly<{ mode: "required" }>
  | Readonly<{ mode: "not-applicable"; reason: "structurally-single-decision-path"; rationale: string }>;
export interface StrictTddPlan {
  readonly expectedFailingCaseIds: readonly string[];
  readonly decisionPaths: readonly StrictDecisionPath[];
  readonly triangulationPolicy: StrictTriangulationPolicy;
}
export interface StrictRedResult {
  readonly cycleId: string; readonly requirementId: string; readonly planHash: string; readonly state: "red-recorded";
  readonly candidate: Readonly<{ id: string; repository: string; revision: string }>;
  readonly adapterId: "node-test"; readonly commandFingerprint: string; readonly testPaths: readonly string[]; readonly executedCaseIds: readonly string[];
  readonly failingCaseIds: readonly string[]; readonly assertionFingerprint: string; readonly failureKind: "assertion";
}
export interface StrictGreenResult {
  readonly cycleId: string; readonly requirementId: string; readonly planHash: string; readonly state: "green-recorded";
  readonly red: StrictRedResult; readonly greenCandidate: Readonly<{ id: string; repository: string; revision: string }>;
  readonly adapterId: "node-test"; readonly commandFingerprint: string; readonly testPaths: readonly string[];
  readonly executedCaseIds: readonly string[]; readonly expectedFailingCaseIds: readonly string[];
}
export interface StrictTddCycle {
  readonly cycleId: string; readonly requirementId: string; readonly planHash: string; readonly state: "awaiting-red"; readonly plan: StrictTddPlan;
  recordRed(redCandidate: Candidate, first: TestObservation, second: TestObservation): StrictRedResult;
  recordGreen(red: StrictRedResult, greenCandidate: Candidate, passing: PassingTestObservation): StrictGreenResult;
}

const candidateKeys=["id","repository","revision","createdAt"] as const;
const issuedRed=new WeakMap<object,object>(),claimedRed=new WeakSet<object>(),issuedGreen=new WeakMap<object,object>();
function exact(value:unknown,keys:readonly string[],noun:string):Record<string,unknown>{
 if(typeof value!=="object"||value===null||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error(`${noun} must be exact plain data`);
 const own=Reflect.ownKeys(value);if(own.length!==keys.length||own.some(key=>typeof key!=="string"||!keys.includes(key))||keys.some(key=>!Object.hasOwn(value,key)))throw new Error(`${noun} shape is invalid`);
 return Object.fromEntries(keys.map(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!("value" in descriptor))throw new Error(`${noun} shape is invalid`);return [key,descriptor.value];}));
}
function text(value:unknown,noun:string):string{
 if(typeof value!=="string"||!value||value.trim()!==value||value!==value.normalize("NFC")||/[\u0000-\u001f\u007f-\u009f]/u.test(value))throw new Error(`${noun} is malformed`);return value;
}
function normalizedText(value:unknown,noun:string):string{const result=text(value,noun);if(result.replace(/\s+/gu," ")!==result)throw new Error(`${noun} is not normalized`);return result;}
function path(value:unknown,noun="path"):string{const result=text(value,noun);if(result.startsWith("/")||result.includes("\\")||result.includes(":")||result.split("/").some(part=>!part||part==="."||part===".."))throw new Error(`${noun} is not canonical relative data`);return result;}
function array<T>(value:unknown,noun:string,parse:(item:unknown)=>T):T[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||!value.length)throw new Error(`${noun} must be a nonempty exact array`);
 const indexes=Array.from({length:value.length},(_,index)=>String(index)),own=Reflect.ownKeys(value);if(own.some(key=>typeof key!=="string"||key!=="length"&&!indexes.includes(key)))throw new Error(`${noun} must be a nonempty exact array`);
 return indexes.map(index=>{const descriptor=Object.getOwnPropertyDescriptor(value,index);if(!descriptor?.enumerable||!("value" in descriptor))throw new Error(`${noun} must be a nonempty exact array`);return parse(descriptor.value);});
}
function uniqueStrings(value:unknown,noun:string):string[]{const result=array(value,noun,item=>text(item,noun.slice(0,-1)));if(new Set(result).size!==result.length)throw new Error(`${noun} contains duplicates`);return result;}
function same(first:readonly string[],second:readonly string[]):boolean{return first.length===second.length&&first.every((item,index)=>item===second[index]);}
function parsePlan(value:StrictTddPlan,behaviorPaths:readonly string[]):StrictTddPlan{
 const data=exact(value,["expectedFailingCaseIds","decisionPaths","triangulationPolicy"],"strict TDD plan");
 const expected=uniqueStrings(data.expectedFailingCaseIds,"expected failing case ids");
 const decisions=array(data.decisionPaths,"decision paths",item=>{const entry=exact(item,["caseId","points"],"decision path"),caseId=text(entry.caseId,"decision case id");
  const points=array(entry.points,"decision points",point=>{const data=exact(point,["behaviorPath","startOffset","endOffset"],"decision point"),behaviorPath=path(data.behaviorPath,"behavior path"),startOffset=data.startOffset,endOffset=data.endOffset;
   if(!behaviorPaths.includes(behaviorPath))throw new Error("decision point is not a genuine obligation behavior path");
   if(!Number.isSafeInteger(startOffset)||!Number.isSafeInteger(endOffset)||(startOffset as number)<0||(startOffset as number)>=(endOffset as number))throw new Error("decision point offsets are invalid");
   return Object.freeze({behaviorPath,startOffset:startOffset as number,endOffset:endOffset as number});});
  const keys=points.map(point=>JSON.stringify([point.behaviorPath,point.startOffset,point.endOffset])),compare=(left:StrictDecisionPoint,right:StrictDecisionPoint)=>left.behaviorPath<right.behaviorPath?-1:left.behaviorPath>right.behaviorPath?1:left.startOffset-right.startOffset||left.endOffset-right.endOffset;if(new Set(keys).size!==keys.length||points.some((point,index)=>index>0&&compare(points[index-1]!,point)>=0))throw new Error("decision points must be unique and canonical");
  return Object.freeze({caseId,points:Object.freeze(points)});});
 if(!same(decisions.map(item=>item.caseId),expected))throw new Error("every expected failing case must be mapped exactly once in canonical order");
 const vectors=decisions.map(item=>JSON.stringify(item.points));if(new Set(vectors).size!==vectors.length)throw new Error("decision path vectors must be unique");
 const policyValue=data.triangulationPolicy,policyKeys=typeof policyValue==="object"&&policyValue!==null&&Reflect.ownKeys(policyValue).length===1?["mode"]:["mode","reason","rationale"];
 const rawPolicy=exact(policyValue,policyKeys,"triangulation policy");
 let triangulationPolicy:StrictTriangulationPolicy;
 if(rawPolicy.mode==="required"){if(decisions.length<2)throw new Error("required triangulation needs at least two distinct decision paths");triangulationPolicy=Object.freeze({mode:"required"});}
 else if(rawPolicy.mode==="not-applicable"){if(decisions.length!==1||rawPolicy.reason!=="structurally-single-decision-path")throw new Error("not-applicable triangulation requires one structural decision path");triangulationPolicy=Object.freeze({mode:"not-applicable",reason:"structurally-single-decision-path",rationale:normalizedText(rawPolicy.rationale,"triangulation rationale")});}
 else throw new Error("triangulation policy mode is invalid");
 return Object.freeze({expectedFailingCaseIds:Object.freeze(expected),decisionPaths:Object.freeze(decisions),triangulationPolicy});
}
function candidate(value:Candidate,noun:string){const data=exact(value,candidateKeys,noun);return {id:text(data.id,"candidate id"),repository:text(data.repository,"candidate repository"),revision:text(data.revision,"candidate revision"),createdAt:text(data.createdAt,"candidate creation time")};}
function git(repository:string,args:string[],noun:string):string{try{return execFileSync("git",["--no-replace-objects","-C",repository,...args],{encoding:"utf8",stdio:["ignore","pipe","ignore"]});}catch{throw new Error(`${noun} could not be inspected`);}}
function changedPaths(repository:string,from:string,to:string):string[]{
 const lines=git(repository,["diff-tree","-r","--no-commit-id","--raw","--find-renames","--find-copies-harder",from,to,"--"],"Git diff").trim().split("\n").filter(Boolean);const changed:string[]=[];
 for(const line of lines){const match=/^:\d+ \d+ [0-9a-f]+ [0-9a-f]+ ([A-Z]\d*)\t(.+)$/u.exec(line);if(!match)throw new Error("Git diff shape is invalid");if(/^[RCT]/u.test(match[1]!))throw new Error("GREEN diff cannot rename, copy, or change type");changed.push(path(match[2]!));}return changed;
}
function treeIdentity(repository:string,revision:string,testPath:string):string{const line=git(repository,["ls-tree",revision,"--",testPath],"test identity").trim(),match=/^(\d+) blob ([0-9a-f]+)\t(.+)$/u.exec(line);if(!match||match[3]!==testPath)throw new Error("every RED test path must remain an exact blob");return `${match[1]}:${match[2]}`;}

/** Claims the genuine requirement before parsing any caller-controlled plan data. */
export function beginStrictTddCycle(obligation:TddObligation,value:StrictTddPlan):StrictTddCycle{
 claimTddObligation(obligation);if(obligation.mode!=="required")throw new Error("strict TDD requires an applicable obligation");const plan=parsePlan(value,obligation.behaviorPaths);
 const binding=JSON.stringify({requirementId:obligation.requirementId,plan}),planHash=createHash("sha256").update(`plan\0${binding}`).digest("hex"),cycleId=createHash("sha256").update(`cycle\0${binding}`).digest("hex"),token={};let redAttempted=false,greenAttempted=false,cycle:StrictTddCycle;
 const recordRed=function(this:unknown,candidateValue:Candidate,first:TestObservation,second:TestObservation):StrictRedResult{
  if(this!==cycle)throw new Error("strict TDD cycle method requires the exact issued cycle");if(redAttempted)throw new Error("strict TDD RED was already attempted");redAttempted=true;
  let firstProof:ReturnType<typeof claimTestObservation>|undefined,secondProof:ReturnType<typeof claimTestObservation>|undefined,claimError:unknown;try{firstProof=claimTestObservation(first);}catch(error){claimError=error;}try{secondProof=claimTestObservation(second);}catch(error){claimError??=error;}if(claimError||!firstProof||!secondProof)throw claimError;
  const red=candidate(candidateValue,"RED candidate");if(red.id!==obligation.candidate.id||red.repository!==obligation.candidate.repository||red.repository!==obligation.repositoryIdentity)throw new Error("RED candidate identity mismatch");assertExactGitCandidate(red,red.repository);assertDirectGitParent(red.repository,obligation.candidate.revision,red.revision);
  const changed=changedPaths(red.repository,obligation.candidate.revision,red.revision);if(!changed.length||changed.some(item=>!first.testPaths.includes(item)))throw new Error("RED diff must be nonempty and limited to executed strict test paths");
  if(firstProof===secondProof)throw new Error("RED requires two different execution proofs");for(const proof of [firstProof,secondProof])if(proof.candidateRepository!==red.repository||proof.candidateId!==red.id||proof.candidateRevision!==red.revision||proof.exitCode===0)throw new Error("RED observation execution mismatch");
  if(first.adapterId!==second.adapterId||first.commandFingerprint!==second.commandFingerprint||!same(first.testPaths,second.testPaths)||!same(first.executedCaseIds,second.executedCaseIds)||!same(first.failingCaseIds,second.failingCaseIds)||first.assertionFingerprint!==second.assertionFingerprint||first.failureKind!=="assertion"||second.failureKind!=="assertion")throw new Error("RED observations are nondeterministic");if(!same(first.failingCaseIds,plan.expectedFailingCaseIds))throw new Error("RED failing cases do not match the plan");
  const result=Object.freeze({cycleId,requirementId:obligation.requirementId,planHash,state:"red-recorded" as const,candidate:Object.freeze({id:red.id,repository:red.repository,revision:red.revision}),adapterId:first.adapterId,commandFingerprint:first.commandFingerprint,testPaths:Object.freeze([...first.testPaths]),executedCaseIds:Object.freeze([...first.executedCaseIds]),failingCaseIds:Object.freeze([...first.failingCaseIds]),assertionFingerprint:first.assertionFingerprint,failureKind:"assertion" as const});issuedRed.set(result,token);return result;
 };
 const recordGreen=function(this:unknown,red:StrictRedResult,greenValue:Candidate,passing:PassingTestObservation):StrictGreenResult{
  if(this!==cycle)throw new Error("strict TDD cycle method requires the exact issued cycle");if(greenAttempted)throw new Error("strict TDD GREEN was already attempted");greenAttempted=true;
  let proof:ReturnType<typeof claimPassingTestObservation>|undefined,claimError:unknown,owner:object|undefined;try{if(typeof red!=="object"||red===null||!issuedRed.has(red))throw new Error("RED result was not issued here");if(claimedRed.has(red))throw new Error("RED result has already been claimed");claimedRed.add(red);owner=issuedRed.get(red);}catch(error){claimError=error;}try{proof=claimPassingTestObservation(passing);}catch(error){claimError??=error;}if(claimError||!proof)throw claimError;if(owner!==token)throw new Error("RED result belongs to another strict TDD cycle");
  const green=candidate(greenValue,"GREEN candidate");if(green.id!==red.candidate.id||green.repository!==red.candidate.repository)throw new Error("GREEN candidate identity mismatch");assertExactGitCandidate(green,green.repository);assertDirectGitParent(green.repository,red.candidate.revision,green.revision);
  if(proof.candidateRepository!==green.repository||proof.candidateId!==green.id||proof.candidateRevision!==green.revision||proof.exitCode!==0)throw new Error("GREEN observation execution mismatch");if(passing.adapterId!==red.adapterId||passing.commandFingerprint!==red.commandFingerprint||!same(passing.testPaths,red.testPaths)||!same(passing.executedCaseIds,red.executedCaseIds)||!red.failingCaseIds.every(item=>passing.executedCaseIds.includes(item)))throw new Error("GREEN must pass the exact RED runner, test paths, and cases");
  for(const testPath of passing.testPaths){if(!red.executedCaseIds.length||treeIdentity(green.repository,red.candidate.revision,testPath)!==treeIdentity(green.repository,green.revision,testPath))throw new Error("GREEN must preserve exact RED test blobs and modes");}
  const changed=changedPaths(green.repository,red.candidate.revision,green.revision);if(!changed.length)throw new Error("GREEN diff must be nonempty");if(changed.some(item=>passing.testPaths.includes(item)||!obligation.behaviorPaths.includes(item)))throw new Error("GREEN diff must contain only exact obligation behavior paths");
  const result=Object.freeze({cycleId,requirementId:obligation.requirementId,planHash,state:"green-recorded" as const,red,greenCandidate:Object.freeze({id:green.id,repository:green.repository,revision:green.revision}),adapterId:passing.adapterId,commandFingerprint:passing.commandFingerprint,testPaths:Object.freeze([...passing.testPaths]),executedCaseIds:Object.freeze([...passing.executedCaseIds]),expectedFailingCaseIds:Object.freeze([...plan.expectedFailingCaseIds])});issuedGreen.set(result,token);return result;
 };
 cycle=Object.freeze({cycleId,requirementId:obligation.requirementId,planHash,state:"awaiting-red" as const,plan,recordRed,recordGreen});return cycle;
}
