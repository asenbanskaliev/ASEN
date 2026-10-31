import {createHash} from "node:crypto";
import {isProxy} from "node:util/types";
import type {RddReproductionEvidence} from "./rdd-reproduction.js";
import {claimRddReproductionEvidence,parseRddReproductionRecord} from "./rdd-reproduction.js";

export interface RddDefectBindingInput {
 readonly invariantIds:readonly string[];
 readonly operatorFlows:readonly {readonly id:string;readonly from:string;readonly to:string;readonly failureTo:string}[];
 readonly runtimeJourney:Readonly<{command:readonly string[];commandFingerprint:string;result:"reproduced";candidateId:string;candidateRevision:string;limitations:readonly string[]}>;
 readonly rollback:Readonly<{boundary:"candidate";targetRevision:string;procedure:readonly string[]}>;
 readonly forecast:Readonly<{changedLines:number;verificationEffort:string;remainingUncertainty:readonly string[];deferredVerification:readonly string[]}>;
}
export interface RddDefectBinding {
 readonly schemaVersion:1;
 readonly reproduction:RddReproductionEvidence;
 readonly invariantIds:readonly string[];
 readonly operatorFlows:readonly Readonly<{id:string;from:string;to:string;failureTo:string}>[];
 readonly runtimeJourney:Readonly<{command:readonly string[];commandFingerprint:string;result:"reproduced";candidateId:string;candidateRevision:string;limitations:readonly string[]}>;
 readonly rollback:Readonly<{boundary:"candidate";targetRevision:string;procedure:readonly string[]}>;
 readonly forecast:Readonly<{changedLines:number;verificationEffort:string;remainingUncertainty:readonly string[];deferredVerification:readonly string[]}>;
}
const inputKeys=["invariantIds","operatorFlows","runtimeJourney","rollback","forecast"] as const;
function plain(value:unknown,keys:readonly string[],noun:string):Record<string,unknown>{
 if(isProxy(value)||typeof value!=="object"||value===null||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error(`${noun} must be exact plain data`);
 const own=Reflect.ownKeys(value);if(own.length!==keys.length||own.some(k=>typeof k!=="string"||!keys.includes(k))||keys.some(k=>!Object.hasOwn(value,k)))throw new Error(`${noun} shape is invalid`);
 const out:Record<string,unknown>={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!("value" in d))throw new Error(`${noun} must contain plain values`);out[key]=d.value;}return out;
}
function text(value:unknown,noun:string,max=512):string{
 if(typeof value!=="string"||!value||value.length>max||value.trim()!==value||value.normalize("NFC")!==value||/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value))throw new Error(`${noun} is malformed`);return value;
}
function array(value:unknown,noun:string,min=1,max=32):unknown[]{
 if(isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length<min||value.length>max)throw new Error(`${noun} must be a bounded exact array`);
 const indexes=Array.from({length:value.length},(_,i)=>String(i)),keys=Reflect.ownKeys(value);
 if(keys.length!==indexes.length+1||keys.some(k=>typeof k!=="string"||k!=="length"&&!indexes.includes(k)))throw new Error(`${noun} must be dense exact data`);
 return indexes.map(k=>{const d=Object.getOwnPropertyDescriptor(value,k);if(!d?.enumerable||!("value" in d))throw new Error(`${noun} must contain plain values`);return d.value;});
}
function list(value:unknown,noun:string,min=1,max=32):string[]{
 const out=array(value,noun,min,max).map(v=>text(v,noun.slice(0,-1)));
 if(new Set(out).size!==out.length)throw new Error(`${noun} contains duplicates`);return out;
}
const freezeStrings=(value:string[])=>Object.freeze([...value]);
function materialize(evidence:RddReproductionEvidence,input:RddDefectBindingInput):RddDefectBinding {
 const data=plain(input,inputKeys,"defect binding");
 const invariantIds=list(data.invariantIds,"invariant ids");if(!["approved-issue","current-main","deterministic-reproduction"].every(id=>invariantIds.includes(id)))throw new Error("defect binding is missing a required invariant");
 const rawFlows=array(data.operatorFlows,"operator flows",1,16);
 const flows=rawFlows.map(raw=>{const f=plain(raw,["id","from","to","failureTo"],"operator flow");return Object.freeze({id:text(f.id,"flow id"),from:text(f.from,"flow source"),to:text(f.to,"flow target"),failureTo:text(f.failureTo,"flow failure")});});
 if(new Set(flows.map(f=>f.id)).size!==flows.length)throw new Error("operator flow ids contain duplicates");if(flows.some(f=>f.failureTo!=="blocked"))throw new Error("operator flows require an explicit blocked failure destination");if(flows.some(f=>f.to===f.failureTo))throw new Error("operator flow success and failure destinations must differ");
 const journey=plain(data.runtimeJourney,["command","commandFingerprint","result","candidateId","candidateRevision","limitations"],"runtime journey");
 if(journey.result!=="reproduced"||journey.commandFingerprint!==evidence.observation.commandFingerprint||journey.candidateId!==evidence.candidate.id||journey.candidateRevision!==evidence.candidate.revision)throw new Error("runtime journey is not bound to the reproduction");
 const journeyCommand=list(journey.command,"journey command",1,32);if(createHash("sha256").update(JSON.stringify(journeyCommand)).digest("hex")!==evidence.observation.commandFingerprint)throw new Error("runtime journey command must exactly match the executed test path command");
 const rollback=plain(data.rollback,["boundary","targetRevision","procedure"],"rollback");if(rollback.boundary!=="candidate"||rollback.targetRevision!==evidence.mainCommitIdentity)throw new Error("rollback must stay at the candidate boundary");
 const forecast=plain(data.forecast,["changedLines","verificationEffort","remainingUncertainty","deferredVerification"],"forecast");
 if(typeof forecast.changedLines!=="number"||!Number.isSafeInteger(forecast.changedLines)||forecast.changedLines<1||forecast.changedLines>=390)throw new Error("forecast changed lines must stay below 390");
 const result:RddDefectBinding={schemaVersion:1,reproduction:evidence,invariantIds:freezeStrings(invariantIds),operatorFlows:Object.freeze(flows),runtimeJourney:Object.freeze({command:freezeStrings(journeyCommand),commandFingerprint:text(journey.commandFingerprint,"journey fingerprint"),result:"reproduced",candidateId:text(journey.candidateId,"journey candidate id"),candidateRevision:text(journey.candidateRevision,"journey revision"),limitations:freezeStrings(list(journey.limitations,"journey limitations",1,16))}),rollback:Object.freeze({boundary:"candidate",targetRevision:text(rollback.targetRevision,"rollback target revision"),procedure:freezeStrings(list(rollback.procedure,"rollback procedure",1,16))}),forecast:Object.freeze({changedLines:forecast.changedLines,verificationEffort:text(forecast.verificationEffort,"verification effort"),remainingUncertainty:freezeStrings(list(forecast.remainingUncertainty,"remaining uncertainty",1,16)),deferredVerification:freezeStrings(list(forecast.deferredVerification,"deferred verification",1,16))})};
 return Object.freeze(result);
}

const bindings=new WeakSet<object>(),consumedBindings=new WeakSet<object>();
export function bindRddDefectEvidence(reproduction:RddReproductionEvidence,input:RddDefectBindingInput):RddDefectBinding {
 const bound=materialize(claimRddReproductionEvidence(reproduction),input);bindings.add(bound);return bound;
}
/** Handoff de un uso; los datos recuperados no obtienen este marcador. */
export function claimRddDefectBinding(value:unknown):RddDefectBinding {
 if(typeof value!=="object"||value===null||!bindings.has(value))throw new Error("Defect intake requires genuine binding");
 if(consumedBindings.has(value))throw new Error("Defect binding already consumed");consumedBindings.add(value);return value as RddDefectBinding;
}
export function parseRddDefectRecord(value:unknown):RddDefectBinding {
 const data=plain(value,["schemaVersion","reproduction",...inputKeys],"defect record");
 if(data.schemaVersion!==1)throw new Error("Defect record schema mismatch");
 const input=Object.fromEntries(inputKeys.map(key=>[key,data[key]]));
 return materialize(parseRddReproductionRecord(data.reproduction),input as unknown as RddDefectBindingInput);
}
