/** EF-202 read-only exploration telemetry: guidance, never delegated authority. */
export const EXPLORER_QUERY_LIMIT=3;
export const EXPLORER_OUTPUT_LIMIT_BYTES=40*1024;
const READ_TOOLS=new Set(["read","grep","find","ls","codegraph","asen_code_intelligence","web_search","web_fetch"]);
export interface ExplorerBudgetObservation{toolCallId:string;toolName:string;args?:unknown;result?:unknown;content?:unknown;}
export interface ExplorerBudgetSnapshot{
 readonly queries:number;readonly outputBytes:number;readonly firstTool:string|undefined;
 readonly overBudget:boolean;readonly recommendationIssued:boolean;
}
function bytesObserved(event:ExplorerBudgetObservation):number{
 const result=event.result as {content?:unknown}|undefined;
 const blocks=result?.content??event.content;
 if(!Array.isArray(blocks))return 0;
 let bytes=0;
 for(const item of blocks){
  if(item&&typeof item==="object"&&"text" in item&&typeof item.text==="string"){
   bytes+=Buffer.byteLength(item.text,"utf8");
   if(bytes>=1024*1024)return 1024*1024;
  }
 }
 return bytes;
}
export class ExplorerBudgetTelemetry{
 readonly #seen=new Set<string>();
 #queries=0;#bytes=0;#firstTool:string|undefined;
 #recommendationIssued=false;
 snapshot():ExplorerBudgetSnapshot{
  return Object.freeze({queries:this.#queries,outputBytes:this.#bytes,firstTool:this.#firstTool,
   overBudget:this.#queries>EXPLORER_QUERY_LIMIT||this.#bytes>EXPLORER_OUTPUT_LIMIT_BYTES,
   recommendationIssued:this.#recommendationIssued});
 }
 /** A single signal on query 4 or byte 40961; no model is launched. */
 observe(event:ExplorerBudgetObservation):boolean{
  if(this.#recommendationIssued)return false;
  if(!event||typeof event.toolCallId!=="string"||!event.toolCallId||event.toolCallId.length>512||
     typeof event.toolName!=="string"||!READ_TOOLS.has(event.toolName)||this.#seen.has(event.toolCallId))return false;
  // The canonical CodeGraph tool also exposes init/sync (index writes).
  // Never misclassify those as Explorer read-only research.
  if(event.toolName==="codegraph"||event.toolName==="asen_code_intelligence"){
   const input=event.args as {operation?:unknown}|undefined;
   const output=event.result as {details?:{operation?:unknown}}|undefined;
   const operation=input?.operation??output?.details?.operation;
   if(operation==="init"||operation==="sync")return false;
  }
  this.#seen.add(event.toolCallId);
  this.#firstTool??=event.toolName;
  this.#queries++;
  this.#bytes+=bytesObserved(event);
  const exceeded=this.#queries>EXPLORER_QUERY_LIMIT||this.#bytes>EXPLORER_OUTPUT_LIMIT_BYTES;
  if(exceeded)this.#recommendationIssued=true;
  return exceeded;
 }
}
