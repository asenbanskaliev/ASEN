import {sanitizeTerminalText,truncateForTerminal} from "./responsive-layout.js";

/** Public observation boundary; fields remain unknown until runtime validation. */
export interface HostStatusInput {
 readonly model?: unknown;
 readonly thinkingLevel?: unknown;
 readonly getContextUsage?: () => unknown;
}
/** Pass only metadata from an observed public assistant message, never its content. */
export interface HostResponseObservation {
 readonly role?: unknown;
 readonly provider?: unknown;
 readonly responseModel?: unknown;
}
export interface HostStatusProjection {
 readonly selectedModel: {readonly provider:string;readonly model:string} | null;
 readonly respondingModel: {readonly provider:string;readonly model:string} | null;
 readonly effectiveThinking: string | null;
 readonly context: {readonly percent:number|null;readonly state:"normal"|"warning"|"error"|"unknown"};
 readonly cost: "unavailable";
 readonly subscription: "unavailable";
 readonly quota: "unavailable";
}
const thinkingLevels=new Set(["off","minimal","low","medium","high","xhigh","max"]);
function observe<T>(read:()=>T):T|null {
 try {return read();} catch {return null;}
}
function record(value:unknown):value is Record<string,unknown> {
 return value!==null&&typeof value==="object"&&!Array.isArray(value);
}
function label(value:unknown):string|null {
 if(typeof value!=="string"||!value.trim())return null;
 // Match the existing status model budget using terminal columns, not code units.
 return truncateForTerminal(sanitizeTerminalText(value),55);
}
function identity(provider:unknown,model:unknown):HostStatusProjection["selectedModel"] {
 const p=label(provider),m=label(model);
 return p&&m?{provider:p,model:m}:null;
}

/** Stateless, read-only derivation. No history scan, host registry, or execution. */
export function projectHostStatus(host:HostStatusInput={},response?:HostResponseObservation):HostStatusProjection {
 const selectedModel=observe(()=>{
  const model=host.model;
  return record(model)?identity(model.provider,model.id):null;
 });
 const respondingModel=observe(()=>response?.role==="assistant"
  ?identity(response.provider,response.responseModel):null);
 const effectiveThinking=observe(()=>{
  const level=host.thinkingLevel;
  return typeof level==="string"&&thinkingLevels.has(level)?level:null;
 });
 const percent=observe(()=>{
  const getUsage=host.getContextUsage;
  const usage=typeof getUsage==="function"?getUsage.call(host):undefined;
  if(!record(usage))return null;
  const tokens=usage.tokens,window=usage.contextWindow;
  if(typeof tokens!=="number"||!Number.isFinite(tokens)||tokens<0||
   typeof window!=="number"||!Number.isFinite(window)||window<=0)return null;
  const value=usage.percent;
  return typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=100?value:null;
 });
 return {
  selectedModel,respondingModel,effectiveThinking,
  context:{percent,state:percent===null?"unknown":percent>=95?"error":percent>=80?"warning":"normal"},
  // Assistant-only totals omit other usage categories and are not billing evidence.
  cost:"unavailable",subscription:"unavailable",quota:"unavailable",
 };
}
