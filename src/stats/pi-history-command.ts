import {collectPiHistoryStats,parsePiHistoryRange,type PiHistoryMeasurementCounts,type PiHistoryModelIdentity} from "./pi-history-stats.js";

function projectMeasurements(result:PiHistoryMeasurementCounts&{measurementCounts?:PiHistoryMeasurementCounts}){
 const observed=(key:keyof PiHistoryMeasurementCounts)=>(result.measurementCounts?.[key]??0)>0?result[key]:null;
 return {inputTokens:observed("inputTokens"),outputTokens:observed("outputTokens"),totalTokens:observed("totalTokens"),costUsd:observed("costUsd")};
}

/** Project fresh local aggregates as v2 observed measurements; no cache or writes. */
export async function runPiHistoryStatsCommand(args:string,sessionDir?:string,projectRoot?:string,activeModel:PiHistoryModelIdentity|null=null):Promise<string>{
 const option=args.trim(),byDay=option==="--by-day",byModel=option==="--by-model";
 const range=byDay||byModel?{}:parsePiHistoryRange(args);
 const {byDay:daily,byModel:models,...result}=await collectPiHistoryStats(sessionDir&&projectRoot?[sessionDir]:[],range,projectRoot,byModel?{byModel:activeModel}:{byDay});
 return JSON.stringify({...result,schema:"asen.pi-history-stats/v2",...projectMeasurements(result),
  ...(daily?{byDay:{...daily,days:daily.days.map(day=>({day:day.day,...projectMeasurements(day),measurementCounts:day.measurementCounts}))}}:{}),
  ...(models?{byModel:{...models,rows:models.rows.map(row=>({day:row.day,model:row.model,usageEntries:row.usageEntries,...projectMeasurements(row),measurementCounts:row.measurementCounts}))}}:{})
 },null,2);
}
