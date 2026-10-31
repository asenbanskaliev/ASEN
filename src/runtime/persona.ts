import {lstat,mkdir,readFile} from "node:fs/promises";
import path from "node:path";
import {atomicWriteText} from "../io/atomic-write.js";
import {withExclusiveFileLock} from "../io/exclusive-file-lock.js";

export const ASEN_PERSONA_SCHEMA="asen.persona/v1" as const;
export const ASEN_PERSONA_STYLE_SECTION="asen_persona_style" as const;
export const ASEN_PERSONA_USAGE="Usage: /asen-persona [professional | neutral]" as const;
export type PersonaStyle="professional"|"neutral";
export type PersonaSource="project"|"global"|"default";
export interface PersonaSelection{style:PersonaStyle;source:PersonaSource;available:true}
interface PersonaFile{schema:typeof ASEN_PERSONA_SCHEMA;style:PersonaStyle}

const styleText:Readonly<Record<PersonaStyle,string>>=Object.freeze({
 professional:"Use a professional, direct, and respectful communication style. Keep responses clear and concise.",
 neutral:"Use a neutral, direct, and concise communication style.",
});

function isStyle(value:unknown):value is PersonaStyle{return value==="professional"||value==="neutral";}
function parsePersona(raw:string):PersonaFile{
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error("Invalid persona configuration");}
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid persona configuration");
 const record=value as Record<string,unknown>,keys=Object.keys(record).sort();
 if(keys.length!==2||keys[0]!=="schema"||keys[1]!=="style"||record.schema!==ASEN_PERSONA_SCHEMA||!isStyle(record.style))throw new Error("Invalid persona configuration");
 return {schema:ASEN_PERSONA_SCHEMA,style:record.style};
}
async function regularFileState(file:string):Promise<"missing"|"file">{
 let parent;try{parent=await lstat(path.dirname(file));}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return "missing";throw error;}
 if(parent.isSymbolicLink()||!parent.isDirectory())throw new Error("Persona configuration directory must be a real directory");
 try{const metadata=await lstat(file);if(metadata.isSymbolicLink()||!metadata.isFile())throw new Error("Persona configuration must be a regular file");return "file";}
 catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return "missing";throw error;}
}
async function readPersonaFile(file:string):Promise<PersonaFile|undefined>{
 if(await regularFileState(file)==="missing")return undefined;
 return parsePersona(await readFile(file,"utf8"));
}
export function personaStyleText(style:PersonaStyle):string{return styleText[style];}
export function personaConfigPaths(home:string,project:string):{globalFile:string;projectFile:string}{
 return {globalFile:path.join(home,".asen","persona.json"),projectFile:path.join(project,".asen","persona.json")};
}
export async function resolvePersonaStyle(globalFile:string,projectFile:string):Promise<PersonaSelection>{
 const project=await readPersonaFile(projectFile);if(project)return {style:project.style,source:"project",available:true};
 const global=await readPersonaFile(globalFile);if(global)return {style:global.style,source:"global",available:true};
 return {style:"professional",source:"default",available:true};
}
async function writePersonaFile(file:string,style:PersonaStyle,createParent:boolean):Promise<void>{
 if(!isStyle(style))throw new Error("Invalid persona style");
 if(createParent)await mkdir(path.dirname(file),{recursive:true,mode:0o700});
 const parent=await lstat(path.dirname(file));if(parent.isSymbolicLink()||!parent.isDirectory())throw new Error("Persona configuration directory must be a real directory");
 await withExclusiveFileLock(file,async()=>{
  await regularFileState(file);
  await atomicWriteText(file,`${JSON.stringify({schema:ASEN_PERSONA_SCHEMA,style},null,2)}\n`);
 });
}
/** A selection is global and also keeps an existing project override aligned. */
export async function selectPersonaStyle(globalFile:string,projectFile:string,style:PersonaStyle):Promise<PersonaSelection>{
 if(!isStyle(style))throw new Error("Invalid persona style");
 const [global,project]=await Promise.all([readPersonaFile(globalFile),readPersonaFile(projectFile)]);void global;
 await writePersonaFile(globalFile,style,true);
 if(project)await writePersonaFile(projectFile,style,false);
 return {style,source:project?"project":"global",available:true};
}
