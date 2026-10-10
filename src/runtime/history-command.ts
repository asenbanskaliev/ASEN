import {randomUUID} from "node:crypto";
import {appendHistoryEntry,applyHistoryRetention,commitHistory,deleteHistoryEntry,deleteProjectHistory,readHistoryStore,resetHistoryStore} from "./history-store.js";
import {captureHistory,exportHistory,searchHistory} from "./history.js";

export interface HistoryCommandContext{storePath:string;projectId:string;sessionId:string;hasUI:boolean;confirm?:(title:string,message:string)=>Promise<boolean>}
const usage="Usage: /asen-history [status|enable|disable|search <text>|export|delete <id|all>|reset|retention <1-10000>].";
export async function recordHistoryInput(context:HistoryCommandContext,text:string):Promise<void>{
 const store=await readHistoryStore(context.storePath);if(!store.policy.enabled)return;
 const entry=captureHistory(store.policy,{id:randomUUID(),projectId:context.projectId,sessionId:context.sessionId,text,createdAt:new Date().toISOString()});
 if(entry)await appendHistoryEntry(context.storePath,entry);
}
export async function runHistoryCommand(args:string,context:HistoryCommandContext):Promise<string>{
 const [action,...parts]=args.trim().split(/\s+/u),rest=parts.join(" ");if(!action)return usage;
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
