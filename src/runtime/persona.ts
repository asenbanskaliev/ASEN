import {lstat,mkdir,readFile} from "node:fs/promises";
import path from "node:path";
import {atomicWriteText} from "../io/atomic-write.js";
import {withExclusiveFileLock} from "../io/exclusive-file-lock.js";

export const ASEN_PERSONA_SCHEMA="asen.persona/v1" as const;
export const ASEN_PERSONA_STYLE_SECTION="asen_persona_style" as const;
export const ASEN_PERSONA_USAGE="Usage: /asen-persona [show | professional | neutral | simple]" as const;
export type PersonaStyle="professional"|"neutral"|"simple";
export type PersonaSource="project"|"global"|"default";
export interface PersonaSelection{style:PersonaStyle;source:PersonaSource;available:true}
interface PersonaFile{schema:typeof ASEN_PERSONA_SCHEMA;style:PersonaStyle}

const styleText:Readonly<Record<PersonaStyle,string>>=Object.freeze({
 professional:"Use a professional, direct, and respectful communication style. Keep responses clear and concise.",
 neutral:"Use a neutral, direct, and concise communication style.",
 simple:"Write for someone who has never programmed. Use short sentences and everyday words. Start with the answer in one or two lines, then add details only if they help. If you must use a technical word, explain it at once in plain words with a small real-life example, such as: a branch is like a photocopy of a document where you can try changes without touching the original. Avoid jargon, acronyms, file paths and code unless asked; if they are needed, put them last. Prefer short numbered steps or a few bullets over long paragraphs. Say what you did, what happens next, and what the person must decide. If something failed, say what it means for them and the one best next step. Reply in the language the person uses. When explaining tasks, phases, changes, problems, or improvements, briefly say what each does and why it helps. For several tasks, prefer a compact table: Tarea | Qué hace | Para qué sirve. Avoid unnecessary jargon; explain any needed technical term. For progress, separate done, pending, blocked; one passed test proves only what it checks. Keep detailed explanations available when asked.",
});

export function isPersonaStyle(value:unknown):value is PersonaStyle{return value==="professional"||value==="neutral"||value==="simple";}
const isStyle=isPersonaStyle;
function parsePersona(raw:string):PersonaFile{
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error("Invalid persona configuration");}
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid persona configuration");
 const record=value as Record<string,unknown>,keys=Object.keys(record).sort();
 if(keys.length!==2||keys[0]!=="schema"||keys[1]!=="style"||record.schema!==ASEN_PERSONA_SCHEMA||!isStyle(record.style))throw new Error("Invalid persona configuration");
 return {schema:ASEN_PERSONA_SCHEMA,style:record.style};
}
async function regularFileState(file:string,guard:()=>void=()=>{}):Promise<"missing"|"file">{
 guard();
 let parent:Awaited<ReturnType<typeof lstat>>;try{parent=await lstat(path.dirname(file));}catch(error){guard();if((error as NodeJS.ErrnoException).code==="ENOENT")return "missing";throw error;}
 guard();if(parent.isSymbolicLink()||!parent.isDirectory())throw new Error("Persona configuration directory must be a real directory");
 try{const metadata=await lstat(file);guard();if(metadata.isSymbolicLink()||!metadata.isFile())throw new Error("Persona configuration must be a regular file");return "file";}
 catch(error){guard();if((error as NodeJS.ErrnoException).code==="ENOENT")return "missing";throw error;}
}
async function readPersonaFile(file:string,guard:()=>void=()=>{}):Promise<PersonaFile|undefined>{
 const state=await regularFileState(file,guard);guard();if(state==="missing")return undefined;
 const raw=await readFile(file,"utf8");guard();return parsePersona(raw);
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
async function writePersonaFile(file:string,style:PersonaStyle,createParent:boolean,guard:()=>void):Promise<void>{
 guard();
 if(!isStyle(style))throw new Error("Invalid persona style");
 if(createParent){await mkdir(path.dirname(file),{recursive:true,mode:0o700});guard();}
 const parent=await lstat(path.dirname(file));guard();if(parent.isSymbolicLink()||!parent.isDirectory())throw new Error("Persona configuration directory must be a real directory");
 await withExclusiveFileLock(file,async()=>{
  guard();await regularFileState(file,guard);guard();
  await atomicWriteText(file,`${JSON.stringify({schema:ASEN_PERSONA_SCHEMA,style},null,2)}\n`);guard();
 });guard();
}
/** Global plus an existing project override; guard expiry stops later writes, not completed writes. */
export async function selectPersonaStyle(globalFile:string,projectFile:string,style:PersonaStyle,guard:()=>void=()=>{}):Promise<PersonaSelection>{
 guard();if(!isStyle(style))throw new Error("Invalid persona style");
 const [global,project]=await Promise.all([readPersonaFile(globalFile,guard),readPersonaFile(projectFile,guard)]);guard();void global;
 await writePersonaFile(globalFile,style,true,guard);guard();
 if(project){await writePersonaFile(projectFile,style,false,guard);guard();}
 return {style,source:project?"project":"global",available:true};
}
