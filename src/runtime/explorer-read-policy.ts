/** EF-201/203: one CodeGraph query first; never init, sync or write. */
import {createCodeGraphTool,type CodeGraphRunner} from "../interaction/code-intelligence.js";
export interface F2Probe{
 readonly firstTool:"codegraph";readonly operation:"query";
 readonly status:string;readonly fallback:"read/grep"|null;
 readonly writesAllowed:false;readonly calls:1;
}
export async function inspectCodeGraphFirst(cwd:string,query:string,runner?:CodeGraphRunner):Promise<F2Probe>{
 if(typeof query!=="string"||!query.trim()||query!==query.trim()||query.length>2000||/[\u0000-\u001f\u007f]/u.test(query))throw Error("Invalid F2 query");
 const tool=createCodeGraphTool(runner);
 // The read-only query consumes cwd only; the native tool owns all operation and index guards.
 const context={cwd} as Parameters<typeof tool.execute>[4];
 const result=await tool.execute("asen-f2", {operation:"query",query,limit:5}, undefined,undefined,context);
 const observed=result.details as {status?:unknown}|undefined;
 const status=typeof observed?.status==="string"?observed.status:"unknown";
 return {firstTool:"codegraph",operation:"query",status,
  fallback:["unavailable","failed","not_initialized"].includes(status)?"read/grep":null,
  writesAllowed:false,calls:1};
}
