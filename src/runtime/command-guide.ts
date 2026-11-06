import {commandDiscoveryNotice,type CommandDiscovery,type RegisteredCommand} from "./command-palette.js";
import {sanitizeTerminalText,truncateForTerminal} from "./responsive-layout.js";

const ENTRY_LIMIT=64;
const publicName=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/u;

function clean(value:unknown,maxUnits:number):string{
 if(typeof value!=="string")return "";
 return sanitizeTerminalText(value.slice(0,maxUnits)).replace(/\s+/gu," ").trim();
}

function displayWidth(value:number):number{
 return Number.isSafeInteger(value)&&value>0?Math.min(value,240):100;
}

function line(value:string,width:number):string{
 return truncateForTerminal(clean(value,4096),width);
}

function inspectedEntries(result:CommandDiscovery):{entries:RegisteredCommand[];limited:boolean}{
 const entries:RegisteredCommand[]=[],seen=new Set<string>();
 let limited=result.limited||result.entries.length>ENTRY_LIMIT;
 for(const candidate of result.entries.slice(0,ENTRY_LIMIT)){
  try{
   const name=clean(candidate.name,96);
   if(!publicName.test(name)||seen.has(name)){limited=true;continue;}
   seen.add(name);
   const group=clean(candidate.group,64)||"unknown";
   const description=clean(candidate.description,2048);
   entries.push({name,group,description,implemented:true,label:""});
  }catch{limited=true;}
 }
 return {entries,limited};
}

/** Format inspected public command metadata. This function never reads handlers or private source metadata. */
export function formatCommandGuide(result:CommandDiscovery,query="",width=100):string[]{
 const columns=displayWidth(width);
 if(result.state==="unavailable")return [line(commandDiscoveryNotice({state:"unavailable",entries:[],limited:result.limited}),columns)];
 const inspected=inspectedEntries(result);
 const rawQuery=clean(query,256).replace(/^\//u,"").trim();
 if(result.state==="empty")return [line("No registered commands reported. Manual guidance is unavailable.",columns)];
 if(rawQuery){
  const exact=inspected.entries.find(entry=>entry.name===rawQuery)??inspected.entries.find(entry=>entry.name.toLowerCase()===rawQuery.toLowerCase());
  if(!exact){
   const lines=[line(`No exact registered command matches "${rawQuery}".`,columns)];
   if(inspected.limited)lines.push(line("Limited view: duplicate, malformed, or excess rows were withheld.",columns));
   return lines;
  }
  const summary=exact.description?`/${exact.name} - ${exact.description}`:`/${exact.name} - No public description reported.`;
  const lines=[line(summary,columns),line(`Type /${exact.name} manually`,columns),line("This guide does not execute the command.",columns)];
  if(exact.name==="asen-job-inspect")lines.push(
   line("Inspect owned Jobs metadata only; logs withheld because safe projection is unavailable.",columns),
   line("Type /asen-job-inspect [id]; omit ID to select an owned job.",columns),
   line("Recovered metadata is historical, not resumed, and cannot be controlled.",columns),
   line("The optional native view can request Stop only for a currently owned live ASEN registry job.",columns),
   line("No Follow or log viewer is available; this guide does not execute Stop.",columns),
  );
  if(inspected.limited)lines.push(line("Limited view: duplicate, malformed, or excess rows were withheld.",columns));
  return lines;
 }
 if(result.state==="no-match")return [line("No matching registered commands in the inspected inventory.",columns)];
 if(!inspected.entries.length)return [line("No valid registered commands reported. Manual guidance is unavailable.",columns)];
 const lines=[line("Registered command guide (manual invocation only).",columns)];
 const groups=new Map<string,RegisteredCommand[]>();
 for(const entry of inspected.entries){const rows=groups.get(entry.group);if(rows)rows.push(entry);else groups.set(entry.group,[entry]);}
 for(const [group,entries] of groups){
  lines.push(line(`[${group}]`,columns));
  for(const entry of entries)lines.push(line(`/${entry.name}${entry.description?` - ${entry.description}`:""}`,columns));
 }
 if(inspected.limited)lines.push(line("Limited view: duplicate, malformed, or excess rows were withheld.",columns));
 return lines;
}
