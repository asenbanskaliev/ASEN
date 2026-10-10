import {consumeValidatedAgentResult,type AgentResult} from "../agents/dispatcher.js";
export type PublicAgentState="queued"|"running"|"interrupted"|"cancelled"|"failed"|"completed";
export interface PublicAgentRecord{id:string;role:string;owner:{kind:"user"|"agent"|"system";id:string};sessionId:string;projectId:string;state:PublicAgentState;createdAt:string;updatedAt:string;summary?:string}
export interface AgentLifecycleSink{createdAt():string;queued(input:Omit<PublicAgentRecord,"state"|"updatedAt">):void|Promise<void>;running(id:string,at?:string):void|Promise<void>;completed(id:string,result:AgentResult,at?:string):void|Promise<void>;failed(id:string,summary?:string,at?:string):void|Promise<void>;cancelled(id:string,summary?:string,at?:string):void|Promise<void>;snapshot():readonly PublicAgentRecord[]}
const terminal=new Set<PublicAgentState>(["cancelled","failed","completed"]);
function safeIdentity(value:unknown):value is string{return typeof value==="string"&&value.length>0&&value.length<=256&&value===value.trim()&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value);}
export function createAgentRecord(input:Omit<PublicAgentRecord,"state"|"updatedAt">):PublicAgentRecord{if(!input||typeof input!=="object"||!safeIdentity(input.id)||!safeIdentity(input.role)||!safeIdentity(input.owner?.id)||!safeIdentity(input.sessionId)||!safeIdentity(input.projectId))throw new Error("Agent identity is incomplete or invalid");if(!input.owner||typeof input.owner!=="object"||!["user","agent","system"].includes(input.owner.kind))throw new Error("Invalid agent owner kind");if(typeof input.createdAt!=="string"||!Number.isFinite(Date.parse(input.createdAt)))throw new Error("Invalid timestamp");return {...structuredClone(input),state:"queued",updatedAt:input.createdAt};}
function applyTransition(record:PublicAgentRecord,next:PublicAgentState,at:string,summary?:string,runnerSucceeded=false):PublicAgentRecord{if(!record||typeof record!=="object"||!["queued","running","interrupted","cancelled","failed","completed"].includes(record.state))throw new Error("Invalid agent state");if(terminal.has(record.state))throw new Error("Terminal agent cannot transition");const allowed:Record<PublicAgentState,PublicAgentState[]>={queued:["running","interrupted","cancelled","failed"],running:["interrupted","cancelled","failed",...(runnerSucceeded?["completed" as const]:[])],interrupted:["cancelled"],cancelled:[],failed:[],completed:[]};if(!allowed[record.state].includes(next))throw new Error("Invalid agent transition; completion requires a successful in-process runner result and interrupted work requires a new authorized dispatch");if(typeof at!=="string")throw new Error("Invalid agent transition timestamp");const nextTime=Date.parse(at),currentTime=Date.parse(record.updatedAt);if(!Number.isFinite(nextTime)||!Number.isFinite(currentTime))throw new Error("Invalid agent transition timestamp");if(nextTime<currentTime)throw new Error("Agent transition is stale");return {...structuredClone(record),state:next,updatedAt:at,...(summary!==undefined?{summary}:record.summary!==undefined?{summary:record.summary}:{})};}
export function transitionAgent(record:PublicAgentRecord,next:PublicAgentState,at:string,summary?:string):PublicAgentRecord{return applyTransition(record,next,at,summary,false);}
/** Creates the sole valid completed projection from a live, one-use Dispatcher receipt. */
export function completeAgentRecord(record:PublicAgentRecord,result:AgentResult,sink:AgentLifecycleSink,at:string):PublicAgentRecord{if(!record||record.state!=="running"||!consumeValidatedAgentResult(result,sink,record.id,record.sessionId,record.projectId)||result.id!==record.id||result.ok!==true)throw new Error("Agent completion requires a successful, unused Dispatcher result for this sink and task identity");return applyTransition(record,"completed",at,result.output,true);}
export function agentStatusRows(records:readonly PublicAgentRecord[],width=120):string[]{return records.map(r=>{const p=`${r.state.padEnd(11)} ${r.role} ${r.owner.kind}:${r.owner.id} `,detail=`${r.id}${r.summary?` — ${r.summary.replace(/[\u0000-\u001f\u007f-\u009f]+/gu," ").replace(/\s+/gu," ").trim()}`:""}`,room=Math.max(4,width-p.length),value=detail.length>room?"…"+detail.slice(-(room-1)):detail;return (p+value).slice(0,width);});}
export function createAgentLifecycleSink(now:()=>string=()=>new Date().toISOString()):AgentLifecycleSink{
 const records=new Map<string,PublicAgentRecord>();
 const move=(id:string,state:Exclude<PublicAgentState,"queued">,summary?:string,at=now())=>{const current=records.get(id);if(!current)throw new Error("Agent lifecycle record does not exist");records.set(id,transitionAgent(current,state,at,summary));};
 let sink:AgentLifecycleSink;
 sink=Object.freeze({
  createdAt(){return now();},
  queued(input:Omit<PublicAgentRecord,"state"|"updatedAt">){if(records.has(input.id))throw new Error("Agent lifecycle record already exists");records.set(input.id,createAgentRecord(input));},
  running(id:string,at?:string){move(id,"running",undefined,at);},
  completed(id:string,result:AgentResult,at=now()){const current=records.get(id);if(!current)throw new Error("Only a running agent can complete");records.set(id,completeAgentRecord(current,result,sink,at));},
  failed(id:string,summary?:string,at?:string){move(id,"failed",summary,at);},
  cancelled(id:string,summary?:string,at?:string){move(id,"cancelled",summary,at);},
  snapshot(){return [...records.values()].map(record=>structuredClone(record));}
 });
 return sink;
}

/** Recover persisted in-flight work after restart without treating it as complete. */
export function recoverAgentLifecycleRecords(records:readonly PublicAgentRecord[],at:string):PublicAgentRecord[]{
 if(!Array.isArray(records)||typeof at!=="string"||!Number.isFinite(Date.parse(at)))throw new Error("Invalid lifecycle recovery input");
 const ids=new Set<string>();
 return records.map(record=>{
  if(!record||typeof record!=="object"||!safeIdentity(record.id)||ids.has(record.id)||!["queued","running","interrupted","cancelled","failed","completed"].includes(record.state))throw new Error("Invalid lifecycle recovery record");
  ids.add(record.id);
  const base=createAgentRecord({id:record.id,role:record.role,owner:record.owner,sessionId:record.sessionId,projectId:record.projectId,createdAt:record.createdAt});
  if(typeof record.updatedAt!=="string"||!Number.isFinite(Date.parse(record.updatedAt))||Date.parse(record.updatedAt)<Date.parse(base.createdAt))throw new Error("Invalid lifecycle recovery timestamp");
  if(record.state==="queued")return base;
  if(record.state==="running")return transitionAgent(transitionAgent(base,"running",record.updatedAt),"interrupted",at,"Execution interrupted by process restart; explicit authorization required to resume");
  if(record.state==="interrupted")return transitionAgent(transitionAgent(base,"running",record.updatedAt),"interrupted",record.updatedAt,record.summary);
  if(record.state==="failed")return transitionAgent(base,"failed",record.updatedAt,record.summary);
  if(record.state==="cancelled")return transitionAgent(base,"cancelled",record.updatedAt,record.summary);
  if(record.state==="completed"){
   const running=transitionAgent(base,"running",record.updatedAt);
   return transitionAgent(running,"interrupted",at,record.summary);
  }
  const running=transitionAgent(base,"running",record.updatedAt);
  return transitionAgent(running,"interrupted",at,"Execution interrupted by process restart; explicit authorization required to resume");
 });
}
