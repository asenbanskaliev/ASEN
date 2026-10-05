import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {types} from "node:util";

export const MEMORY_PROTOCOL_FIXTURE="registry/parity/memory-protocol-contracts-v1.json";

const deepFreeze=value=>{
 if(value&&typeof value==="object"&&!Object.isFrozen(value)){
  Object.freeze(value);
  for(const child of Object.values(value))deepFreeze(child);
 }
 return value;
};

export function loadMemoryProtocol(root){
 try{return deepFreeze(JSON.parse(readFileSync(resolve(root,MEMORY_PROTOCOL_FIXTURE),"utf8")));}
 catch(error){throw new Error(`cannot load memory protocol fixture: ${error instanceof Error?error.message:String(error)}`);}
}

const EXPECTED_CONTRACT=loadMemoryProtocol(resolve(import.meta.dirname,"../../.."));

const exact=(actual,expected,seen)=>{
 if(expected===null||typeof expected!=="object")return Object.is(actual,expected);
 if(actual===null||typeof actual!=="object"||types.isProxy(actual)||seen.has(actual))return false;
 seen.add(actual);
 try{
  if(Array.isArray(expected)){
   if(!Array.isArray(actual)||Object.getPrototypeOf(actual)!==Array.prototype)return false;
   const keys=Reflect.ownKeys(actual);
   if(keys.length!==expected.length+1||!keys.includes("length"))return false;
   for(let index=0;index<expected.length;index++){
    const descriptor=Object.getOwnPropertyDescriptor(actual,String(index));
    if(!descriptor||!("value" in descriptor)||!descriptor.enumerable||!exact(descriptor.value,expected[index],seen))return false;
   }
   return keys.every(key=>key==="length"||(typeof key==="string"&&Number.isSafeInteger(Number(key))&&String(Number(key))===key&&Number(key)<expected.length));
  }
  if(Array.isArray(actual)||Object.getPrototypeOf(actual)!==Object.prototype)return false;
  const expectedKeys=Object.keys(expected),actualKeys=Reflect.ownKeys(actual);
  if(actualKeys.length!==expectedKeys.length||actualKeys.some(key=>typeof key!=="string"||!Object.hasOwn(expected,key)))return false;
  for(const key of expectedKeys){
   const descriptor=Object.getOwnPropertyDescriptor(actual,key);
   if(!descriptor||!("value" in descriptor)||!descriptor.enumerable||!exact(descriptor.value,expected[key],seen))return false;
  }
  return true;
 }finally{seen.delete(actual);}
};

export function validateMemoryProtocol(value){
 try{
  if(!value||typeof value!=="object"||types.isProxy(value)||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return ["contract must be a plain object"];
  return exact(value,EXPECTED_CONTRACT,new WeakSet())?[]:["contract must match the exact SOURCE_INSPECTED reference"];
 }catch{return ["contract must be a plain JSON data structure"];}
}

export const memoryProtocolSlice=Object.freeze({
 id:"current-memory-protocol-authority",
 fixturePath:MEMORY_PROTOCOL_FIXTURE,
 load:loadMemoryProtocol,
 validate:validateMemoryProtocol,
 successLabel:"1 current-memory-protocol source-inspected contract"
});

export const writerAParitySlices=Object.freeze([memoryProtocolSlice]);
