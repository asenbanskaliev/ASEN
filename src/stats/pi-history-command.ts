import {collectPiHistoryStats,parsePiHistoryRange} from "./pi-history-stats.js";

/** Project fresh local aggregates as v2 observed measurements; no cache or writes. */
export async function runPiHistoryStatsCommand(args:string,sessionDir?:string,projectRoot?:string):Promise<string>{
 const range=parsePiHistoryRange(args),result=await collectPiHistoryStats(sessionDir&&projectRoot?[sessionDir]:[],range,projectRoot);
 const observed=(key:"inputTokens"|"outputTokens"|"totalTokens"|"costUsd")=>(result.measurementCounts?.[key]??0)>0?result[key]:null;
 return JSON.stringify({...result,schema:"asen.pi-history-stats/v2",inputTokens:observed("inputTokens"),outputTokens:observed("outputTokens"),totalTokens:observed("totalTokens"),costUsd:observed("costUsd")},null,2);
}
