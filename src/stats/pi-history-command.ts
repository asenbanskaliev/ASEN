import {collectPiHistoryStats,parsePiHistoryRange} from "./pi-history-stats.js";

/** Collect fresh local aggregates for the active Pi session directory; no cache or writes. */
export async function runPiHistoryStatsCommand(args:string,sessionDir?:string,projectRoot?:string):Promise<string>{
 const range=parsePiHistoryRange(args),result=await collectPiHistoryStats(sessionDir&&projectRoot?[sessionDir]:[],range,projectRoot);return JSON.stringify(result,null,2);
}
