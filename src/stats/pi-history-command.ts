import {collectPiHistoryStats,parsePiHistoryRange,type PiHistoryMeasurementCounts} from "./pi-history-stats.js";

function projectMeasurements(result:PiHistoryMeasurementCounts&{measurementCounts?:PiHistoryMeasurementCounts}){
 const observed=(key:keyof PiHistoryMeasurementCounts)=>(result.measurementCounts?.[key]??0)>0?result[key]:null;
 return {inputTokens:observed("inputTokens"),outputTokens:observed("outputTokens"),totalTokens:observed("totalTokens"),costUsd:observed("costUsd")};
}

/** Project fresh local aggregates as v2 observed measurements; no cache or writes. */
export async function runPiHistoryStatsCommand(args:string,sessionDir?:string,projectRoot?:string):Promise<string>{
 const byDay=args.trim()==="--by-day",range=byDay?{}:parsePiHistoryRange(args);
 const {byDay:daily,...result}=await collectPiHistoryStats(sessionDir&&projectRoot?[sessionDir]:[],range,projectRoot,{byDay});
 return JSON.stringify({...result,schema:"asen.pi-history-stats/v2",...projectMeasurements(result),...(daily?{byDay:{...daily,days:daily.days.map(day=>({day:day.day,...projectMeasurements(day),measurementCounts:day.measurementCounts}))}}:{})},null,2);
}
