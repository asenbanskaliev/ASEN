import {createHash} from "node:crypto";
import {MAX_RDD_POLICY_BYTES,parseRddPolicyText,type ParsedRddPolicy} from "./rdd-policy.js";

const TYPED_ARRAY_PROTOTYPE=Object.getPrototypeOf(Uint8Array.prototype) as object;
const BYTE_LENGTH_GETTER=Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE,"byteLength")?.get;
const BUFFER_GETTER=Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE,"buffer")?.get;
const ARRAY_BUFFER_SLICE=ArrayBuffer.prototype.slice;
const TYPED_ARRAY_SET=Uint8Array.prototype.set;
const RESIZABLE_GETTER=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,"resizable")?.get;
const DOMAIN="asen.rdd-policy.v1\0";

function fail(message:string):never{throw new Error(`RDD policy ${message}`);}

function snapshotBytes(bytes:Uint8Array):Uint8Array{
 if(typeof bytes!=="object"||bytes===null)return fail("byte source must be an exact Uint8Array or Buffer");
 let length:number,buffer:ArrayBufferLike;
 try{
  length=BYTE_LENGTH_GETTER!.call(bytes) as number;
  buffer=BUFFER_GETTER!.call(bytes) as ArrayBufferLike;
 }catch{return fail("byte source is detached or invalid");}
 if(length>MAX_RDD_POLICY_BYTES)return fail(`byte source exceeds the ${MAX_RDD_POLICY_BYTES}-byte limit`);
 const prototype=Object.getPrototypeOf(bytes);
 const hasBufferBrand=typeof Buffer!=="undefined"&&Buffer.isBuffer(bytes);
 const isExactUint8=!hasBufferBrand&&prototype===Uint8Array.prototype;
 const isExactBuffer=hasBufferBrand&&prototype===Buffer.prototype;
 if(!isExactUint8&&!isExactBuffer)return fail("byte source must be an exact Uint8Array or Buffer");
 if(typeof SharedArrayBuffer!=="undefined"&&buffer instanceof SharedArrayBuffer)return fail("byte source must not use shared storage");
 if(!(buffer instanceof ArrayBuffer))return fail("byte source backing storage is invalid");
 if(RESIZABLE_GETTER?.call(buffer)===true)return fail("byte source must not use resizable storage");
 try{ARRAY_BUFFER_SLICE.call(buffer,0,0);}catch{return fail("byte source is detached");}
 const keys=Reflect.ownKeys(bytes);
 if(keys.length!==length)return fail("byte source must be undecorated");
 for(let index=0;index<length;index++){
  const descriptor=Object.getOwnPropertyDescriptor(bytes,String(index));
  if(!descriptor?.enumerable||!("value" in descriptor)||typeof descriptor.value!=="number")return fail("byte source must be an undecorated dense byte view");
 }
 // Fixed, non-shared storage cannot change concurrently. No input-owned code runs
 // between validation and this native copy, so this is the exact stable snapshot.
 const snapshot=new Uint8Array(length);
 try{TYPED_ARRAY_SET.call(snapshot,bytes);}catch{return fail("byte source changed during snapshot");}
 return snapshot;
}

function exactUtf8(bytes:Uint8Array):string{
 if(bytes.length>=3&&bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)return fail("UTF-8 BOM is not permitted");
 let source:string;
 try{source=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{return fail("bytes are not valid UTF-8");}
 const encoded=new TextEncoder().encode(source);
 if(encoded.length!==bytes.length||encoded.some((byte,index)=>byte!==bytes[index]))return fail("UTF-8 roundtrip did not preserve original bytes");
 return source;
}

export function parseRddPolicyBytes(bytes:Uint8Array,expectedContentIdentity:string):ParsedRddPolicy{
 const snapshot=snapshotBytes(bytes);
 if(typeof expectedContentIdentity!=="string"||!/^[0-9a-f]{64}$/u.test(expectedContentIdentity))return fail("expected content identity must be lowercase SHA-256");
 const source=exactUtf8(snapshot);
 const contentIdentity=createHash("sha256").update(DOMAIN,"utf8").update(snapshot).digest("hex");
 if(contentIdentity!==expectedContentIdentity)return fail("content identity does not match expected original bytes");
 const parsed=parseRddPolicyText(source);
 if(parsed.contentIdentity!==contentIdentity)return fail("text and original-byte content identities disagree");
 return parsed;
}
