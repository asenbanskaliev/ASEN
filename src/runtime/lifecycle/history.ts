export interface HistoryEntry{id:string;sessionId:string;projectId:string;text:string;createdAt:string;redacted:boolean}
export interface HistoryPolicy{enabled:boolean;maxEntries:number}
export function redactHistoryText(text:string):{text:string;redacted:boolean}{
 let out=text,redacted=false;
 const rules:readonly [RegExp,string][]=[
  [/\b(Bearer)\s+[A-Za-z0-9._~-]{8,}\b/gi,"$1 [REDACTED]"],
  [/\b(password|passwd|token|secret)\s*[:=]\s*\S+/gi,"$1 [REDACTED]"],
  [/\bsk-[A-Za-z0-9_-]{12,}\b/g,"[REDACTED]"],
 ];
 for(const [pattern,replacement] of rules){
  const next=out.replace(pattern,replacement);
  if(next!==out)redacted=true;
  out=next;
 }
 return {text:out,redacted};
}
export function captureHistory(policy:HistoryPolicy,entry:Omit<HistoryEntry,"redacted">):HistoryEntry|undefined{if(!policy.enabled)return undefined;if(policy.maxEntries<1||policy.maxEntries>10000)throw new Error("Invalid history retention");if(!entry.id||!entry.sessionId||!entry.projectId||entry.id.length>256||entry.sessionId.length>256||entry.projectId.length>256||entry.text.length>12000||!Number.isFinite(Date.parse(entry.createdAt)))throw new Error("Invalid history entry");const bounded={...entry,text:entry.text.slice(0,12000)},r=redactHistoryText(bounded.text);return {...bounded,...r};}
export function trimHistory(policy:HistoryPolicy,entries:readonly HistoryEntry[]):HistoryEntry[]{if(!policy.enabled)return [];return entries.slice(-policy.maxEntries).map(e=>structuredClone(e));}
export function exportHistory(entries:readonly HistoryEntry[],projectId:string):string{return JSON.stringify(entries.filter(e=>e.projectId===projectId),null,2)+"\n";}
export function searchHistory(entries:readonly HistoryEntry[],projectId:string,query:string,limit=50):HistoryEntry[]{if(query.length>512||!Number.isSafeInteger(limit)||limit<1||limit>200)throw new Error("Invalid history search");const needle=query.trim().toLocaleLowerCase();return entries.filter(entry=>entry.projectId===projectId&&(!needle||entry.text.toLocaleLowerCase().includes(needle))).slice(-limit).reverse().map(entry=>structuredClone(entry));}
