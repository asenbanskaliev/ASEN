import {existsSync,readdirSync,readFileSync} from "node:fs";
import {join} from "node:path";

/**
 * ASEN agent tool overlay (P46, ported from Gentle Shell v4.8.0 `lib/agent-tool-overlay.ts`):
 * a load-time layer that adds or removes agent tools without editing the package-owned
 * agent files. Like the routing layer, it is applied at load and never written back, so
 * package ownership and upgrade behavior stay untouched.
 *
 * Sources merge low -> high; a higher source wins per tool:
 *   1. drop-ins under `<configHome>/agent-overlays.d/*.json` (sorted filename)
 *   2. global `<configHome>/tools.json`
 *   3. project `<cwd>/.pi/gentle-ai/tools.json`
 */
export interface ToolOverlay{
 add:string[];
 remove:string[];
}

function isPlainObject(value:unknown):value is Record<string,unknown>{
 return typeof value==="object"&&value!==null&&!Array.isArray(value);
}
function isStringArray(value:unknown):value is string[]{
 return Array.isArray(value)&&value.every((item)=>typeof item==="string");
}
function toolsOf(value:unknown):string[]{
 return isStringArray(value)?value:[];
}

/** Reads one overlay file; a missing source is silent, a malformed one is skipped with a notice. */
function readOverlay(path:string):ToolOverlay|undefined{
 if(!existsSync(path))return undefined;
 let parsed:unknown;
 try{parsed=JSON.parse(readFileSync(path,"utf8"))as unknown;}
 catch{
  console.warn(`ignored invalid tool overlay ${path}`);
  return undefined;
 }
 if(!isPlainObject(parsed)){
  console.warn(`ignored invalid tool overlay ${path}`);
  return undefined;
 }
 const {add,remove}=parsed;
 if((add!==undefined&&!isStringArray(add))||(remove!==undefined&&!isStringArray(remove))){
  console.warn(`ignored invalid tool overlay ${path}`);
  return undefined;
 }
 return {add:toolsOf(add),remove:toolsOf(remove)};
}

function dropInPaths(configHome:string):string[]{
 const dir=join(configHome,"agent-overlays.d");
 let files:string[];
 try{files=readdirSync(dir,{withFileTypes:true}).filter((entry)=>entry.isFile()&&entry.name.endsWith(".json")).map((entry)=>entry.name).sort((left,right)=>left<right?-1:left>right?1:0);}
 catch{return [];}
 return files.map((name)=>join(dir,name));
}

/** Merges every configured overlay source into one add/remove set for the current workspace. */
export function loadToolOverlays(configHome:string,cwd:string):ToolOverlay{
 const sources:string[]=[...dropInPaths(configHome),join(configHome,"tools.json"),join(cwd,".pi","gentle-ai","tools.json")];
 const add=new Set<string>();
 const remove=new Set<string>();
 for(const path of sources){
  const overlay=readOverlay(path);
  if(overlay===undefined)continue;
  for(const tool of overlay.add){add.add(tool);remove.delete(tool);}
  for(const tool of overlay.remove){remove.add(tool);add.delete(tool);}
 }
 return {add:[...add],remove:[...remove]};
}

/** Applies an overlay to a tool list; without an overlay the original array reference is kept. */
export function applyToolOverlay(tools:readonly string[],overlay:ToolOverlay|undefined):string[]{
 if(overlay===undefined)return tools as string[];
 const removed=new Set(overlay.remove);
 return [...new Set([...tools,...overlay.add])].filter((tool)=>!removed.has(tool));
}
