import {types} from "node:util";
export type TaskState="planned"|"running"|"blocked"|"done"|"cancelled";
export interface TaskEvent{taskId:string;sessionId:string;projectId:string;revision:number;state:TaskState;at:string;reason?:string}
const next:Record<TaskState,readonly TaskState[]>={planned:["running","cancelled"],running:["blocked","done","cancelled"],blocked:["running","cancelled"],done:[],cancelled:[]};
function validTimestamp(value:unknown):value is string{if(typeof value!=="string"||value.length>40||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value))return false;const time=Date.parse(value);if(!Number.isFinite(time))return false;const milliseconds=value.replace(/(?:\.(\d{1,3}))?Z$/u,(_,fraction:string|undefined)=>`.${(fraction??"").padEnd(3,"0")}Z`);return new Date(time).toISOString()===milliseconds;}
function exactEvent(value:unknown):TaskEvent{
 if(typeof value!=="object"||value===null||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error("Task event must be exact plain data");
 const keys=Reflect.ownKeys(value),expected=["taskId","sessionId","projectId","revision","state","at",...(Object.hasOwn(value,"reason")?["reason"]:[])];
 if(keys.length!==expected.length||keys.some(k=>typeof k!=="string"||!expected.includes(k)))throw new Error("Task event shape mismatch");
 const out:Record<string,unknown>={};for(const key of expected){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!("value" in descriptor))throw new Error("Task event accessor rejected");out[key]=descriptor.value;}
 const id=(v:unknown)=>typeof v==="string"&&v.length>0&&v.length<=256&&v===v.trim()&&v===v.normalize("NFC")&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v);
 if(!id(out.taskId)||!id(out.sessionId)||!id(out.projectId)||!Number.isSafeInteger(out.revision)||Number(out.revision)<1||typeof out.state!=="string"||!Object.hasOwn(next,out.state)||!validTimestamp(out.at))throw new Error("Invalid task event");
 if(out.reason!==undefined&&(typeof out.reason!=="string"||!out.reason||out.reason.length>8192||out.reason!==out.reason.trim()||out.reason!==out.reason.normalize("NFC")||/[\u0000-\u001f\u007f-\u009f]/u.test(out.reason)))throw new Error("Invalid task event reason");
 return structuredClone(out) as unknown as TaskEvent;
}
export function applyTaskEvent(current:TaskEvent|undefined,event:TaskEvent):TaskEvent{const checked=exactEvent(event);if(!current){if(checked.revision!==1||checked.state!=="planned")throw new Error("First task event must be planned revision 1");return checked;}if(current.taskId!==checked.taskId||current.sessionId!==checked.sessionId||current.projectId!==checked.projectId)throw new Error("Task identity mismatch");if(checked.revision!==current.revision+1)throw new Error("Task revision conflict");if(!next[current.state].includes(checked.state))throw new Error("Invalid task transition");if(Date.parse(checked.at)<Date.parse(current.at))throw new Error("Stale task event");return checked;}
export function replayTask(events:readonly TaskEvent[]):TaskEvent|undefined{let state:TaskEvent|undefined;for(const event of events)state=applyTaskEvent(state,event);return state;}
