import {execFileSync} from "node:child_process";
import {isProxy} from "node:util/types";
import type {Candidate} from "../core/types.js";
import {assertExactGitCandidate,type ExecutedEvidence} from "../evidence/execution.js";
import {assertDirectGitParent} from "../evidence/git-lineage.js";
import {claimTestObservation,type TestObservation} from "../test/tdd-observation.js";
import {claimRddRepositoryInspectionSnapshot,type RddRepositoryInspectionSnapshot} from "./rdd-repository-inspection.js";

export interface RddReproductionInput {
 readonly repositoryUrl:string;
 readonly issueUrl:string;
 readonly mainCommitIdentity:string;
 readonly candidate:Readonly<Pick<Candidate,"id"|"repository"|"revision">>;
 readonly reproductionCaseIds:readonly string[];
 readonly negativeControlCaseIds:readonly string[];
}
export interface RddReproductionEvidence {
 readonly schemaVersion:1;readonly repositoryUrl:string;readonly issueUrl:string;readonly mainCommitIdentity:string;
 readonly candidate:Readonly<Pick<Candidate,"id"|"repository"|"revision">>;
 readonly reproductionCaseIds:readonly string[];readonly negativeControlCaseIds:readonly string[];
 readonly observation:Readonly<{adapterId:"node-test";commandFingerprint:string;testPaths:readonly string[];executedCaseIds:readonly string[];failingCaseIds:readonly string[];assertionFingerprint:string;failureKind:"assertion"}>;
 readonly repeatedRuns:2;
}
const issuedReproductions=new WeakSet<object>(),claimedReproductions=new WeakSet<object>();
const inputKeys=["repositoryUrl","issueUrl","mainCommitIdentity","candidate","reproductionCaseIds","negativeControlCaseIds"] as const,candidateKeys=["id","repository","revision"] as const;
function record(value:unknown,keys:readonly string[],noun:string):Record<string,unknown>{
 if(isProxy(value)||typeof value!=="object"||value===null||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error(`${noun} must be exact plain data and not a proxy`);
 const own=Reflect.ownKeys(value);if(own.length!==keys.length||own.some(key=>typeof key!=="string"||!keys.includes(key))||keys.some(key=>!Object.hasOwn(value,key)))throw new Error(`${noun} shape is invalid`);
 return Object.fromEntries(keys.map(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!("value" in descriptor))throw new Error(`${noun} must be exact plain data`);return [key,descriptor.value];}));
}
function hasControls(value:string):boolean{return [...value].some(character=>{const code=character.charCodeAt(0);return code<32||code>=127&&code<=159;});}
function text(value:unknown,noun:string):string{if(typeof value!=="string"||!value||value.length>4096||value.trim()!==value||value.normalize("NFC")!==value||hasControls(value))throw new Error(`${noun} is malformed`);return value;}
function sha(value:unknown,noun:string):string{const result=text(value,noun);if(!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(result))throw new Error(`${noun} is malformed`);return result;}
function strings(value:unknown,noun:string):string[]{
 if(isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||!value.length||value.length>1000)throw new Error(`${noun} must be a nonempty bounded exact array and not a proxy`);
 const indexes=Array.from({length:value.length},(_,index)=>String(index)),own=Reflect.ownKeys(value);if(own.length!==indexes.length+1||own.some(key=>typeof key!=="string"||key!=="length"&&!indexes.includes(key)))throw new Error(`${noun} must be a dense exact array`);
 const result=indexes.map(index=>{const descriptor=Object.getOwnPropertyDescriptor(value,index);if(!descriptor?.enumerable||!("value" in descriptor))throw new Error(`${noun} must contain plain values`);return text(descriptor.value,noun.slice(0,-1));});if(new Set(result).size!==result.length)throw new Error(`${noun} contains duplicate case ids`);return result;
}
function same(left:readonly string[],right:readonly string[]):boolean{return left.length===right.length&&left.every((item,index)=>item===right[index]);}
function changedPaths(repository:string,from:string,to:string):string[]{
 let output:string;try{output=execFileSync("git",["--no-replace-objects","-C",repository,"diff-tree","-r","--no-commit-id","--raw","--find-renames","--find-copies-harder",from,to,"--"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}catch{throw new Error("Reproduction candidate diff could not be inspected");}
 if(!output)return [];return output.split("\n").map(line=>{const match=/^:\d+ \d+ [0-9a-f]+ [0-9a-f]+ ([A-Z]\d*)\t(.+)$/u.exec(line);if(!match||/^[RCT]/u.test(match[1]!))throw new Error("Reproduction candidate diff is ambiguous");const path=match[2]!;if(path.startsWith("/")||path.includes("\\")||path.includes(":")||path.split("/").some(part=>!part||part==="."||part===".."))throw new Error("Reproduction candidate diff path is malformed");return path;});
}
function claimInputs(snapshot:unknown,first:unknown,second:unknown):{inspection:ReturnType<typeof claimRddRepositoryInspectionSnapshot>;first:ExecutedEvidence;second:ExecutedEvidence}{
 let inspection:ReturnType<typeof claimRddRepositoryInspectionSnapshot>|undefined,one:ExecutedEvidence|undefined,two:ExecutedEvidence|undefined,error:unknown;
 try{inspection=claimRddRepositoryInspectionSnapshot(snapshot);}catch(cause){error=cause;}try{one=claimTestObservation(first);}catch(cause){error??=cause;}try{two=claimTestObservation(second);}catch(cause){error??=cause;}if(error||!inspection||!one||!two)throw error;return {inspection,first:one,second:two};
}
/** Consumes one genuine D1b2 snapshot and exactly two genuine fixed-run observations. */
export function recordRddReproduction(snapshot:RddRepositoryInspectionSnapshot,input:RddReproductionInput,first:TestObservation,second:TestObservation):RddReproductionEvidence {
 const claimed=claimInputs(snapshot,first,second),data=record(input,inputKeys,"reproduction input"),candidateData=record(data.candidate,candidateKeys,"reproduction candidate"),candidate={id:text(candidateData.id,"candidate id"),repository:text(candidateData.repository,"candidate repository"),revision:sha(candidateData.revision,"candidate revision"),createdAt:"inspection-bound"},repositoryUrl=text(data.repositoryUrl,"repository URL"),issueUrl=text(data.issueUrl,"issue URL"),mainCommitIdentity=sha(data.mainCommitIdentity,"main commit identity"),reproductionCaseIds=strings(data.reproductionCaseIds,"reproduction case ids"),negativeControlCaseIds=strings(data.negativeControlCaseIds,"negative control case ids");
 if(repositoryUrl!==claimed.inspection.repositoryUrl||issueUrl!==claimed.inspection.issueUrl||mainCommitIdentity!==claimed.inspection.mainCommitIdentity)throw new Error("Reproduction repository, issue, or main binding mismatch");if(reproductionCaseIds.some(id=>negativeControlCaseIds.includes(id)))throw new Error("Reproduction and negative control case ids must be disjoint");
 try{assertExactGitCandidate(candidate,candidate.repository);}catch{throw new Error("Reproduction candidate inspection failed");}assertDirectGitParent(candidate.repository,mainCommitIdentity,candidate.revision);for(const proof of [claimed.first,claimed.second])if(proof.candidateRepository!==candidate.repository||proof.candidateId!==candidate.id||proof.candidateRevision!==candidate.revision||proof.exitCode===0)throw new Error("Reproduction observation candidate binding mismatch");if(claimed.first===claimed.second)throw new Error("Reproduction requires two different execution observations");
 if(first.adapterId!=="node-test"||second.adapterId!=="node-test"||first.failureKind!=="assertion"||second.failureKind!=="assertion"||first.commandFingerprint!==second.commandFingerprint||!same(claimed.first.command,claimed.second.command)||!same(first.testPaths,second.testPaths)||!same(first.executedCaseIds,second.executedCaseIds)||!same(first.failingCaseIds,second.failingCaseIds)||first.assertionFingerprint!==second.assertionFingerprint)throw new Error("Reproduction observations are nondeterministic");
 const declared=[...reproductionCaseIds,...negativeControlCaseIds];if(!same(declared,first.executedCaseIds))throw new Error("Declared reproduction and control cases must be the exact ordered executed cases");if(!same(reproductionCaseIds,first.failingCaseIds))throw new Error("Failing cases must equal declared reproduction cases and controls must pass");const changed=changedPaths(candidate.repository,mainCommitIdentity,candidate.revision),order=(left:string,right:string)=>{if(left<right)return -1;if(left>right)return 1;return 0;},canonicalChanged=[...changed].sort(order),canonicalTests=[...first.testPaths].sort(order);if(!changed.length||new Set(changed).size!==changed.length||new Set(first.testPaths).size!==first.testPaths.length||!same(canonicalChanged,canonicalTests))throw new Error("Reproduction diff must exactly equal the executed test paths");
 const result=Object.freeze({schemaVersion:1 as const,repositoryUrl,issueUrl,mainCommitIdentity,candidate:Object.freeze({id:candidate.id,repository:candidate.repository,revision:candidate.revision}),reproductionCaseIds:Object.freeze(reproductionCaseIds),negativeControlCaseIds:Object.freeze(negativeControlCaseIds),observation:Object.freeze({adapterId:"node-test" as const,commandFingerprint:first.commandFingerprint,testPaths:Object.freeze([...first.testPaths]),executedCaseIds:Object.freeze([...first.executedCaseIds]),failingCaseIds:Object.freeze([...first.failingCaseIds]),assertionFingerprint:first.assertionFingerprint,failureKind:"assertion" as const}),repeatedRuns:2 as const});issuedReproductions.add(result);return result;
}

/** One-use provenance handoff from D2 into the bounded D3 binding consumer. */
export function claimRddReproductionEvidence(value:unknown):RddReproductionEvidence{
 if(typeof value!=="object"||value===null||!issuedReproductions.has(value))throw new Error("Defect binding requires genuine reproduction evidence");
 if(claimedReproductions.has(value))throw new Error("Reproduction evidence already consumed");claimedReproductions.add(value);return value as RddReproductionEvidence;
}

/** Recupera datos descriptivos exactos; nunca emite procedencia viva. */
export function parseRddReproductionRecord(value:unknown):RddReproductionEvidence {
 const data=record(value,["schemaVersion","repositoryUrl","issueUrl","mainCommitIdentity","candidate","reproductionCaseIds","negativeControlCaseIds","observation","repeatedRuns"],"defect reproduction record");
 if(data.schemaVersion!==1||data.repeatedRuns!==2)throw new Error("Defect reproduction schema mismatch");
 const repositoryUrl=text(data.repositoryUrl,"repository URL"),issueUrl=text(data.issueUrl,"issue URL");
 let url:URL;try{url=new URL(repositoryUrl);}catch{throw new Error("Defect repository URL is invalid");}
 if(url.protocol!=="https:"||url.username||url.password||url.port||url.search||url.hash||url.href!==repositoryUrl||!/^\/[^/]+\/[^/]+$/u.test(url.pathname)||!issueUrl.startsWith(repositoryUrl+"/issues/")||!/^[1-9]\d*$/u.test(issueUrl.slice((repositoryUrl+"/issues/").length))||issueUrl.endsWith("/0"))throw new Error("Defect issue repository mismatch");
 const c=record(data.candidate,candidateKeys,"defect candidate"),candidate=Object.freeze({id:text(c.id,"candidate id"),repository:text(c.repository,"candidate repository"),revision:sha(c.revision,"candidate revision")}),mainCommitIdentity=sha(data.mainCommitIdentity,"main commit");
 if(candidate.revision===mainCommitIdentity||candidate.revision.length!==mainCommitIdentity.length)throw new Error("Defect revision lineage is invalid");
 const reproductionCaseIds=strings(data.reproductionCaseIds,"reproduction cases"),negativeControlCaseIds=strings(data.negativeControlCaseIds,"control cases");
 if(reproductionCaseIds.some(id=>negativeControlCaseIds.includes(id)))throw new Error("Defect cases must be disjoint");
 const o=record(data.observation,["adapterId","commandFingerprint","testPaths","executedCaseIds","failingCaseIds","assertionFingerprint","failureKind"],"defect observation"),testPaths=strings(o.testPaths,"test paths"),executedCaseIds=strings(o.executedCaseIds,"executed cases"),failingCaseIds=strings(o.failingCaseIds,"failing cases");
 if(o.adapterId!=="node-test"||o.failureKind!=="assertion"||!same(executedCaseIds,[...reproductionCaseIds,...negativeControlCaseIds])||!same(failingCaseIds,reproductionCaseIds))throw new Error("Defect observation cases mismatch");
 for(const path of testPaths)if(path.startsWith("/")||path.includes("\\")||path.includes(":")||path.split("/").some(part=>!part||part==="."||part==="..")||!/(?:^|\/)[^/]+\.(?:test|spec)\.(?:js|mjs|cjs)$/u.test(path))throw new Error("Defect test path is invalid");
 const commandFingerprint=text(o.commandFingerprint,"command fingerprint"),assertionFingerprint=text(o.assertionFingerprint,"assertion fingerprint");
 if(!/^[0-9a-f]{64}$/u.test(commandFingerprint)||!/^[0-9a-f]{64}$/u.test(assertionFingerprint))throw new Error("Defect fingerprint is invalid");
 return Object.freeze({schemaVersion:1,repositoryUrl,issueUrl,mainCommitIdentity,candidate,reproductionCaseIds:Object.freeze(reproductionCaseIds),negativeControlCaseIds:Object.freeze(negativeControlCaseIds),observation:Object.freeze({adapterId:"node-test",commandFingerprint,testPaths:Object.freeze(testPaths),executedCaseIds:Object.freeze(executedCaseIds),failingCaseIds:Object.freeze(failingCaseIds),assertionFingerprint,failureKind:"assertion"}),repeatedRuns:2});
}
