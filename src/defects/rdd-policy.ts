import {createHash} from "node:crypto";

export const RDD_POLICY_LOCATOR=".asen/rdd-policy.json" as const;
export const MAX_RDD_POLICY_BYTES=64*1024;
const MAX_REQUIRED_LABELS=32;
const MAX_LABEL_BYTES=100;
const POLICY_KEYS=["schemaVersion","reviewMode","issueApproval"] as const;
const APPROVAL_KEYS=["requiredLabels"] as const;

export interface RddIssueApprovalV1{readonly requiredLabels:readonly string[];}
export interface RddPolicyV1{readonly schemaVersion:1;readonly reviewMode:"enabled"|"disabled";readonly issueApproval:RddIssueApprovalV1;}
export interface ParsedRddPolicy{readonly policy:RddPolicyV1;readonly contentIdentity:string;}

function exactRecord(value:unknown,names:readonly string[],noun:string):Record<string,unknown>{
 if(typeof value!=="object"||value===null||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error(`${noun} must be exact plain data`);
 const keys=Reflect.ownKeys(value);
 if(keys.length!==names.length||keys.some(key=>typeof key!=="string"||!names.includes(key))||names.some(name=>!Object.hasOwn(value,name)))throw new Error(`${noun} must be exact plain data`);
 const record:Record<string,unknown>={};
 for(const name of names){const descriptor=Object.getOwnPropertyDescriptor(value,name);if(!descriptor?.enumerable||!("value" in descriptor))throw new Error(`${noun} must be exact plain data`);record[name]=descriptor.value;}
 return record;
}

function exactArray(value:unknown):unknown[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw new Error("requiredLabels must be an exact array");
 const lengthDescriptor=Object.getOwnPropertyDescriptor(value,"length");
 if(!lengthDescriptor||!("value" in lengthDescriptor)||typeof lengthDescriptor.value!=="number"||lengthDescriptor.value>MAX_REQUIRED_LABELS)throw new Error("requiredLabels array exceeds the policy limit");
 const length=lengthDescriptor.value,keys=Reflect.ownKeys(value);
 if(keys.length!==length+1||keys.some(key=>typeof key!=="string"||(key!=="length"&&!/^(?:0|[1-9]\d*)$/u.test(key)))||!keys.includes("length"))throw new Error("requiredLabels must be an undecorated dense array");
 const labels:unknown[]=[];
 for(let index=0;index<length;index++){const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor?.enumerable||!("value" in descriptor))throw new Error("requiredLabels must be a plain data array");labels.push(descriptor.value);}
 return labels;
}

function labelIdentity(value:string):string{return value.normalize("NFKC").toLowerCase();}
function byteCompare(left:string,right:string):number{return Buffer.compare(Buffer.from(left,"utf8"),Buffer.from(right,"utf8"));}
function compareLabels(left:string,right:string):number{return byteCompare(labelIdentity(left),labelIdentity(right))||byteCompare(left,right);}
function requiredLabels(value:unknown):readonly string[]{
 const raw=exactArray(value);
 if(raw.length<1||raw.length>MAX_REQUIRED_LABELS)throw new Error("requiredLabels count exceeds the policy limit");
 const labels=raw.map((item,index)=>{
  if(typeof item!=="string"||item.length===0||item.trim()!==item||item.normalize("NFC")!==item||Buffer.byteLength(item,"utf8")>MAX_LABEL_BYTES||/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(item))throw new Error(`requiredLabels[${index}] must be a bounded canonical control-free label`);
  return item;
 });
 const identities=labels.map(labelIdentity);
 if(new Set(identities).size!==identities.length)throw new Error("requiredLabels contains duplicate compatibility/case-equivalent labels");
 if(labels.some((label,index)=>index>0&&compareLabels(labels[index-1]!,label)>=0))throw new Error("requiredLabels must use canonical order");
 return Object.freeze(labels);
}

export function parseRddPolicy(value:unknown):RddPolicyV1{
 const record=exactRecord(value,POLICY_KEYS,"RDD policy");
 if(record.schemaVersion!==1)throw new Error("RDD policy schemaVersion must be exactly 1");
 if(record.reviewMode!=="enabled"&&record.reviewMode!=="disabled")throw new Error("RDD policy reviewMode is invalid");
 const approval=exactRecord(record.issueApproval,APPROVAL_KEYS,"RDD policy issueApproval");
 return Object.freeze({schemaVersion:1,reviewMode:record.reviewMode,issueApproval:Object.freeze({requiredLabels:requiredLabels(approval.requiredLabels)})});
}

function hasUnpairedSurrogate(value:string):boolean{
 for(let index=0;index<value.length;index++){
  const unit=value.charCodeAt(index);
  if(unit>=0xd800&&unit<=0xdbff){const next=value.charCodeAt(index+1);if(!(next>=0xdc00&&next<=0xdfff))return true;index++;}
  else if(unit>=0xdc00&&unit<=0xdfff)return true;
 }
 return false;
}

function assertUniqueObjectKeys(source:string):void{
 const MAX_DEPTH=64,MAX_TOKENS=4096;let index=0,tokens=0;
 const fail=()=>{throw new Error("RDD policy JSON lexical validation failed");};
 const bounded=()=>{if(++tokens>MAX_TOKENS)throw new Error("RDD policy JSON exceeds lexical token bounds");};
 const whitespace=()=>{while(index<source.length&&/\s/u.test(source[index]!))index++;};
 const string=():string=>{if(source[index]!=="\"")return fail() as never;const start=index++;while(index<source.length){const character=source[index++]!;if(character==="\\"){index++;continue;}if(character==="\""){try{return JSON.parse(source.slice(start,index)) as string;}catch{return fail() as never;}}}return fail() as never;};
 const value=(depth:number):void=>{
  bounded();whitespace();const character=source[index];
  if(character==="{"){
   if(depth>=MAX_DEPTH)throw new Error("RDD policy JSON exceeds lexical depth bounds");index++;whitespace();const seen=new Set<string>();if(source[index]==="}"){index++;return;}
   while(true){bounded();const key=string();if(seen.has(key))throw new Error("RDD policy JSON contains duplicate object key");seen.add(key);whitespace();if(source[index++]!==":")fail();value(depth+1);whitespace();if(source[index]==="}"){index++;return;}if(source[index++]!==",")fail();whitespace();}
  }
  if(character==="["){
   if(depth>=MAX_DEPTH)throw new Error("RDD policy JSON exceeds lexical depth bounds");index++;whitespace();if(source[index]==="]"){index++;return;}
   while(true){value(depth+1);whitespace();if(source[index]==="]"){index++;return;}if(source[index++]!==",")fail();whitespace();}
  }
  if(character==="\""){string();return;}
  const start=index;while(index<source.length&&!/[\s,}\]]/u.test(source[index]!))index++;if(index===start)fail();
 };
 whitespace();value(0);whitespace();if(index!==source.length)fail();
}

export function parseRddPolicyText(source:string):ParsedRddPolicy{
 if(typeof source!=="string")throw new Error("RDD policy JSON must be textual UTF-8 data");
 const bytes=Buffer.byteLength(source,"utf8");
 if(bytes>MAX_RDD_POLICY_BYTES)throw new Error(`RDD policy JSON exceeds the ${MAX_RDD_POLICY_BYTES}-byte limit`);
 if(hasUnpairedSurrogate(source))throw new Error("RDD policy JSON contains invalid Unicode");
 let value:unknown;try{value=JSON.parse(source) as unknown;}catch{throw new Error("RDD policy JSON is malformed");}
 assertUniqueObjectKeys(source);
 const policy=parseRddPolicy(value);
 const contentIdentity=createHash("sha256").update("asen.rdd-policy.v1\0","utf8").update(source,"utf8").digest("hex");
 return Object.freeze({policy,contentIdentity});
}
