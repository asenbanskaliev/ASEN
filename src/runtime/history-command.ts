import {createHash,randomUUID} from "node:crypto";
import {appendHistoryEntry,applyHistoryRetention,commitHistory,deleteHistoryEntry,deleteProjectHistory,readHistoryStore,resetHistoryStore} from "./history-store.js";
import {captureHistory,exportHistory,searchHistory} from "./history.js";
import {cancelHistorySelection,historyUnavailable,normalizeHistoryQuery,projectHistory,selectHistoryEntry,type HistoryProjection,type HistorySelection} from "./history-selector.js";

interface HistorySelectOptions{signal?:AbortSignal}
export interface HistoryCommandContext{storePath:string;projectId:string;sessionId:string;hasUI:boolean;signal?:AbortSignal|undefined;select?:(title:string,options:string[],opts?:HistorySelectOptions)=>Promise<string|undefined>;confirm?:(title:string,message:string)=>Promise<boolean>}
export type HistorySelectionCommandResult=Exclude<HistoryProjection,{state:"data"}>|HistorySelection;
export type HistoryCommandResult=string|HistorySelectionCommandResult;
const HISTORY_SELECT_PAGE_SIZE=20,HISTORY_LABEL_LIMIT=4096,HISTORY_TIMESTAMP_DISPLAY_LIMIT=64;
const usage="Usage: /asen-history [status|enable|disable|search <text>|select [query]|export|delete <id|all>|reset|retention <1-10000>].";
function exactUtf16Digest(value:string):string{
 const hash=createHash("sha256"),unit=Buffer.allocUnsafe(2);for(let index=0;index<value.length;index++){unit.writeUInt16BE(value.charCodeAt(index));hash.update(unit);}return hash.digest("hex");
}
function encodeLabelValue(value:string,maxUnits=value.length):string{
 let output="";const length=Math.min(value.length,maxUnits);
 for(let index=0;index<length;index++){const code=value.charCodeAt(index),character=value.charAt(index);output+=code>=0xd800&&code<=0xdfff||character==="|"||character==="="||character==="~"||/[\p{Cc}\p{Cf}]/u.test(character)?`~${code.toString(16).padStart(4,"0")}`:character;}
 return value.length>maxUnits?`${output}~h${exactUtf16Digest(value)}`:output;
}
function historySelectionLabel(row:{id:string;timestamp:string;redacted:boolean;preview:string}):string{
 const label=`id=${encodeLabelValue(row.id)} | timestamp=${encodeLabelValue(row.timestamp,HISTORY_TIMESTAMP_DISPLAY_LIMIT)} | redacted=${row.redacted} | preview=${encodeLabelValue(row.preview)}`;
 if(label.length>HISTORY_LABEL_LIMIT)throw new Error("Invalid history selection label");return label;
}
function sameHistoryPage(original:Extract<HistoryProjection,{state:"data"}>,current:HistoryProjection):boolean{
 if(current.state!=="data"||original.nextCursor!==current.nextCursor||original.rows.length!==current.rows.length)return false;
 return original.rows.every((row,index)=>{const next=current.rows[index];return next!==undefined&&row.id===next.id&&row.timestamp===next.timestamp&&row.redacted===next.redacted&&row.preview===next.preview;});
}
function cancelledHistorySelection():Extract<HistorySelection,{state:"cancelled"}>{return cancelHistorySelection() as Extract<HistorySelection,{state:"cancelled"}>;}
async function runHistorySelection(queryInput:string,context:HistoryCommandContext):Promise<HistorySelectionCommandResult>{
 if(!context.hasUI||!context.select)return historyUnavailable() as Extract<HistoryProjection,{state:"unavailable"}>;
 if(context.signal?.aborted)return cancelledHistorySelection();
 const query=normalizeHistoryQuery(queryInput),store=await readHistoryStore(context.storePath),projection=projectHistory(store.entries,context.projectId,query,HISTORY_SELECT_PAGE_SIZE);
 if(projection.state!=="data")return projection;
 const choices=new Map(projection.rows.map(row=>[historySelectionLabel(row),row.id]));if(choices.size!==projection.rows.length)throw new Error("Invalid history selection labels");
 const choice=await context.select("Select private history entry",[...choices.keys()],context.signal?{signal:context.signal}:{});
 if(context.signal?.aborted||choice===undefined)return cancelledHistorySelection();
 const id=choices.get(choice);if(id===undefined)throw new Error("Invalid history selection");
 const currentStore=await readHistoryStore(context.storePath);if(context.signal?.aborted)return cancelledHistorySelection();
 const currentProjection=projectHistory(currentStore.entries,context.projectId,query,HISTORY_SELECT_PAGE_SIZE);
 if(!sameHistoryPage(projection,currentProjection))throw new Error("History selection is stale");
 return selectHistoryEntry(currentStore.entries,context.projectId,query,HISTORY_SELECT_PAGE_SIZE,id);
}
export async function recordHistoryInput(context:HistoryCommandContext,text:string):Promise<void>{
 const store=await readHistoryStore(context.storePath);if(!store.policy.enabled)return;
 const entry=captureHistory(store.policy,{id:randomUUID(),projectId:context.projectId,sessionId:context.sessionId,text,createdAt:new Date().toISOString()});
 if(entry)await appendHistoryEntry(context.storePath,entry);
}
export function runHistoryCommand(args:"select"|`select ${string}`,context:HistoryCommandContext):Promise<HistorySelectionCommandResult>;
export function runHistoryCommand(args:string,context:HistoryCommandContext):Promise<string>;
export async function runHistoryCommand(args:string,context:HistoryCommandContext):Promise<HistoryCommandResult>{
 const [action,...parts]=args.trim().split(/\s+/u),rest=parts.join(" ");if(!action)return usage;
 if(action==="select")return runHistorySelection(rest,context);
 if(action==="reset"){
  if(!context.hasUI||!context.confirm||!await context.confirm("Reset private history store?","This permanently removes every project history entry and tombstone, repairs a corrupt store, and leaves capture disabled."))return "History store was not reset.";
  await resetHistoryStore(context.storePath);return "Private history store reset; capture remains disabled until explicitly enabled.";
 }
 let store=await readHistoryStore(context.storePath);
 if(action==="status")return `History ${store.policy.enabled?"enabled":"disabled"}; entries=${store.entries.filter(entry=>entry.projectId===context.projectId).length}; retention=${store.policy.maxEntries}.`;
 if(action==="enable"){
  if(!context.hasUI||!context.confirm||!await context.confirm("Enable private history?","ASEN stores your project prompts locally after redacting common secrets. Nothing is sent outside this machine."))return "History remains disabled.";
  store=await commitHistory(context.storePath,store.revision,current=>({...current,revision:current.revision+1,policy:{...current.policy,enabled:true}}));return "Private project history enabled. Stored prompts are redacted before writing and stay on this machine.";
 }
 if(action==="disable"){
  await commitHistory(context.storePath,store.revision,current=>({...current,revision:current.revision+1,policy:{...current.policy,enabled:false}}));return "History capture disabled. Existing entries are unchanged.";
 }
 if(action==="search")return JSON.stringify(searchHistory(store.entries,context.projectId,rest),null,2);
 if(action==="export")return exportHistory(store.entries,context.projectId);
 if(action==="retention"){
  if(!/^\d{1,5}$/u.test(rest))return usage;const maxEntries=Number(rest);if(maxEntries<1||maxEntries>10000)return usage;
  const next=applyHistoryRetention(store,{...store.policy,maxEntries});await commitHistory(context.storePath,store.revision,()=>next);return `History retention set to ${maxEntries} entries.`;
 }
 if(action==="delete"){
  if(!rest)return usage;
  if(rest==="all"){
   if(!context.hasUI||!context.confirm||!await context.confirm("Delete project history?","This permanently removes all stored history entries for the current project."))return "History was not deleted.";
   await commitHistory(context.storePath,store.revision,current=>deleteProjectHistory(current,context.projectId));return "Project history deleted; tombstones prevent deleted entries from returning.";
  }
  const entry=store.entries.find(value=>value.id===rest&&value.projectId===context.projectId);if(!entry)return "History entry not found in this project.";
  await commitHistory(context.storePath,store.revision,current=>deleteHistoryEntry(current,rest));return "History entry deleted.";
 }
 return usage;
}
