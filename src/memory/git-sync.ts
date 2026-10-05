import {createHash} from "node:crypto";
export const MEMORY_GIT_SYNC_FORMAT = 1 as const;
export type MemorySyncPart={index:number;digest:string;text:string};
export type MemorySyncPlan={format:1;projectId:string;digest:string;parts:{index:number;digest:string}[]};
const digest=(text:string)=>createHash("sha256").update(text).digest("hex");
export function planMemorySync(projectId:string,value:unknown,maxChars=16384):{plan:MemorySyncPlan;parts:MemorySyncPart[]}{
 if(!projectId.trim())throw new Error("projectId is required");
 if(!Number.isInteger(maxChars)||maxChars<1)throw new Error("maxChars must be positive");
 const text=JSON.stringify(value),parts:MemorySyncPart[]=[];
 for(let i=0;i<text.length;i+=maxChars){const part=text.slice(i,i+maxChars);parts.push({index:parts.length,digest:digest(part),text:part});}
 if(!parts.length)parts.push({index:0,digest:digest(""),text:""});
 return {plan:{format:1,projectId,digest:digest(text),parts:parts.map(({index,digest})=>({index,digest}))},parts};
}
export function missingMemorySyncParts(plan:MemorySyncPlan,received:ReadonlyMap<number,string>):number[]{
 return plan.parts.filter(part=>{const text=received.get(part.index);return text===undefined||digest(text)!==part.digest;}).map(part=>part.index);
}
export function assembleMemorySync(plan:MemorySyncPlan,received:ReadonlyMap<number,string>):unknown{
 const missing=missingMemorySyncParts(plan,received);if(missing.length)throw new Error(`Incomplete memory sync: ${missing.join(",")}`);
 const text=plan.parts.map(part=>received.get(part.index)!).join("");if(digest(text)!==plan.digest)throw new Error("Memory sync digest mismatch");
 return JSON.parse(text);
}
