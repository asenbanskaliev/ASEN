import {isProxy} from "node:util/types";
import type {RddReproductionEvidence} from "./rdd-reproduction.js";
import {claimRddReproductionEvidence} from "./rdd-reproduction.js";

export interface RddDefectBindingInput {
 readonly invariantIds:readonly string[];
 readonly operatorFlows:readonly {readonly id:string;readonly from:string;readonly to:string;readonly failureTo:string}[];
 readonly runtimeJourney:Readonly<{command:readonly string[];commandFingerprint:string;result:"reproduced";candidateId:string;candidateRevision:string;limitations:readonly string[]}>;
 readonly rollback:Readonly<{boundary:"candidate";targetRevision:string;procedure:readonly string[]}>;
 readonly forecast:Readonly<{changedLines:number;verificationEffort:string;remainingUncertainty:readonly string[]}>;
}
export interface RddDefectBinding {
 readonly schemaVersion:1;
 readonly reproduction:RddReproductionEvidence;
 readonly invariantIds:readonly string[];
 readonly operatorFlows:readonly Readonly<{id:string;from:string;to:string;failureTo:string}>[];
 readonly runtimeJourney:Readonly<{command:readonly string[];commandFingerprint:string;result:"reproduced";candidateId:string;candidateRevision:string;limitations:readonly string[]}>;
 readonly rollback:Readonly<{boundary:"candidate";targetRevision:string;procedure:readonly string[]}>;
 readonly forecast:Readonly<{changedLines:number;verificationEffort:string;remainingUncertainty:readonly string[]}>;
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
function list(value:unknown,noun:string,min=1,max=32):string[]{
 if(isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length<min||value.length>max)throw new Error(`${noun} must be a bounded exact array`);
 const out=value.map((_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!("value" in d))throw new Error(`${noun} must be dense plain data`);return text(d.value,noun.slice(0,-1));});
 if(new Set(out).size!==out.length)throw new Error(`${noun} contains duplicates`);return out;
}
const freezeStrings=(value:string[])=>Object.freeze([...value]);
export function bindRddDefectEvidence(reproduction:RddReproductionEvidence,input:RddDefectBindingInput):RddDefectBinding {
 const evidence=claimRddReproductionEvidence(reproduction),data=plain(input,inputKeys,"defect binding");
 const invariantIds=list(data.invariantIds,"invariant ids");if(!["approved-issue","current-main","deterministic-reproduction"].every(id=>invariantIds.includes(id)))throw new Error("defect binding is missing a required invariant");
 const rawFlows=data.operatorFlows;if(isProxy(rawFlows)||!Array.isArray(rawFlows)||Object.getPrototypeOf(rawFlows)!==Array.prototype||rawFlows.length<1||rawFlows.length>16)throw new Error("operator flows must be a bounded exact array");
 const flows=rawFlows.map(raw=>{const f=plain(raw,["id","from","to","failureTo"],"operator flow");return Object.freeze({id:text(f.id,"flow id"),from:text(f.from,"flow source"),to:text(f.to,"flow target"),failureTo:text(f.failureTo,"flow failure")});});
 if(new Set(flows.map(f=>f.id)).size!==flows.length)throw new Error("operator flow ids contain duplicates");if(!flows.some(f=>f.failureTo==="blocked"))throw new Error("operator flows require an explicit blocked failure destination");if(flows.some(f=>f.to===f.failureTo))throw new Error("operator flow success and failure destinations must differ");
 const journey=plain(data.runtimeJourney,["command","commandFingerprint","result","candidateId","candidateRevision","limitations"],"runtime journey");
 if(journey.result!=="reproduced"||journey.commandFingerprint!==evidence.observation.commandFingerprint||journey.candidateId!==evidence.candidate.id||journey.candidateRevision!==evidence.candidate.revision)throw new Error("runtime journey is not bound to the reproduction");
 const rollback=plain(data.rollback,["boundary","targetRevision","procedure"],"rollback");if(rollback.boundary!=="candidate"||rollback.targetRevision!==evidence.mainCommitIdentity)throw new Error("rollback must stay at the candidate boundary");
 const forecast=plain(data.forecast,["changedLines","verificationEffort","remainingUncertainty"],"forecast");
 if(typeof forecast.changedLines!=="number"||!Number.isSafeInteger(forecast.changedLines)||forecast.changedLines<1||forecast.changedLines>=390)throw new Error("forecast changed lines must stay below 390");
 const result:RddDefectBinding={schemaVersion:1,reproduction:evidence,invariantIds:freezeStrings(invariantIds),operatorFlows:Object.freeze(flows),runtimeJourney:Object.freeze({command:freezeStrings(list(journey.command,"journey command",1,32)),commandFingerprint:text(journey.commandFingerprint,"journey fingerprint"),result:"reproduced",candidateId:text(journey.candidateId,"journey candidate id"),candidateRevision:text(journey.candidateRevision,"journey revision"),limitations:freezeStrings(list(journey.limitations,"journey limitations",1,16))}),rollback:Object.freeze({boundary:"candidate",targetRevision:text(rollback.targetRevision,"rollback target revision"),procedure:freezeStrings(list(rollback.procedure,"rollback procedure",1,16))}),forecast:Object.freeze({changedLines:forecast.changedLines,verificationEffort:text(forecast.verificationEffort,"verification effort"),remainingUncertainty:freezeStrings(list(forecast.remainingUncertainty,"remaining uncertainty",1,16))})};
 return Object.freeze(result);
}
