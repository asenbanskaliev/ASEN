import {ASEN_COMMAND_CATALOG} from "./command-catalog.js";
import {sanitizeTerminalText,truncateForTerminal} from "./responsive-layout.js";

export interface RegisteredCommand {
 name:string;
 group:string;
 description:string;
 implemented:true;
 label:string;
}
export interface CommandDiscovery {
 state:"reported"|"empty"|"no-match"|"unavailable";
 entries:RegisteredCommand[];
 limited:boolean;
}
const SCAN_LIMIT=512,OUTPUT_LIMIT=64;
const groups=new Map(ASEN_COMMAND_CATALOG.map(row=>[row.name,row.group]));

/** Public registration metadata only. Never inspect sourceInfo or invoke a command. */
export function inspectRegisteredCommands(reader:(()=>unknown)|undefined,query=""):CommandDiscovery {
 try {
  if(typeof reader!=="function")throw new Error();
  const rows=reader();
  if(!Array.isArray(rows))throw new Error();
  const entries:RegisteredCommand[]=[],seen=new Set<string>();
  const term=query.trim().toLowerCase();
  let limited=rows.length>SCAN_LIMIT;
  for(const value of rows.slice(0,SCAN_LIMIT)){
   if(!value||typeof value!=="object"){limited=true;continue;}
   const {name,description:rawDescription,source}=value;
   if(typeof name!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/u.test(name)){limited=true;continue;}
   if(seen.has(name)){limited=true;continue;}
   seen.add(name);
   const description=typeof rawDescription==="string"?truncateForTerminal(sanitizeTerminalText(rawDescription.slice(0,2048)).replace(/\s+/gu," ").trim(),120):"";
   const group=groups.get(name)??(source==="extension"||source==="prompt"||source==="skill"?source:"unknown");
   if(term&&![name,description,group].some(text=>text.toLowerCase().includes(term)))continue;
   if(entries.length===OUTPUT_LIMIT){limited=true;continue;}
   // The complete validated name is never truncated, so labels remain unique.
   const label=`/${name} [${group}]${description?` - ${description}`:""}`;
   entries.push({name,group,description,implemented:true,label});
  }
  return {state:entries.length?"reported":rows.length?"no-match":"empty",entries,limited};
 } catch {return {state:"unavailable",entries:[],limited:false};}
}

export function commandDiscoveryNotice(result:CommandDiscovery):string {
 const state=result.state==="unavailable"?"Registered command inventory unavailable.":
  result.state==="empty"?"No registered commands reported.":
  result.state==="no-match"?"No matching registered commands in the inspected inventory.":
  "Registered command discovery (not the complete interactive command set).";
 return state+(result.limited?" Limited view: rows withheld or scan/output limit reached.":"");
}
