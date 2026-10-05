export type MemoryWriteOutcome="confirmed"|"unknown"|"rejected"|"unavailable";
export interface MemoryWriteResult{outcome:MemoryWriteOutcome;persisted:boolean;}
export function reconcileMemoryWrite(outcome:MemoryWriteOutcome,readBack:()=>boolean):MemoryWriteResult{
 if(outcome==="confirmed")return {outcome,persisted:true};
 if(outcome==="rejected"||outcome==="unavailable")return {outcome,persisted:false};
 return {outcome,persisted:readBack()};
}
export async function preserveFinalResponse<T>(respond:()=>Promise<T>,memoryWork:()=>Promise<unknown>):Promise<T>{
 try{await memoryWork();}catch{/* Memory is auxiliary; final user response remains authoritative. */}
 return respond();
}
