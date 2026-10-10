import {randomUUID} from "node:crypto";
import {readFile,rename} from "node:fs/promises";
import path from "node:path";
import {atomicWriteText} from "../io/atomic-write.js";
import {withExclusiveFileLock} from "../io/exclusive-file-lock.js";
import {preparePrivateFile} from "../io/private-file.js";
import {recordWorkspaceChange,type WorkspaceChange} from "./workspace-attribution.js";

const SCHEMA="asen.workspace/v1" as const,MAX_CHANGES=20000;
export interface StoredWorkspaceChange{revision:number;id:string;change:WorkspaceChange}
export interface WorkspaceFile{schema:typeof SCHEMA;revision:number;changes:StoredWorkspaceChange[]}
export interface WorkspaceIdentity{sessionId:string;projectId:string;worktree:string}
function comparablePath(value:string):string{
 let normalized=value.replace(/\//g,"\\");
 if(/^\\\\\?\\UNC\\/iu.test(normalized))normalized=`\\\\${normalized.slice(8)}`;
 else if(/^\\\\\?\\/u.test(normalized))normalized=normalized.slice(4);
 return path.win32.normalize(normalized).replace(/\\+$/u,"").toLowerCase();
}
export function sameWorkspaceIdentityPath(left:string,right:string,platform:NodeJS.Platform=process.platform):boolean{return platform==="win32"?comparablePath(left)===comparablePath(right):left===right;}
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function empty():WorkspaceFile{return {schema:SCHEMA,revision:0,changes:[]};}
function validChange(value:unknown):value is WorkspaceChange{if(!exact(value,["path","actor","sessionId","projectId","worktree","operation","at"]))return false;try{recordWorkspaceChange(value as unknown as WorkspaceChange);return true;}catch{return false;}}
export function parseWorkspaceFile(raw:string):WorkspaceFile{
 const value:unknown=JSON.parse(raw);if(!exact(value,["schema","revision","changes"])||value.schema!==SCHEMA||!Number.isSafeInteger(value.revision)||Number(value.revision)<0||!Array.isArray(value.changes)||value.changes.length>MAX_CHANGES)return (()=>{throw new Error("Invalid ASEN workspace store");})();
 const ids=new Set<string>();for(let i=0;i<value.changes.length;i++){const item=value.changes[i];if(!exact(item,["revision","id","change"])||item.revision!==i+1||typeof item.id!=="string"||!item.id||ids.has(item.id)||!validChange(item.change))throw new Error("Invalid ASEN workspace store");ids.add(item.id);}
 if(value.revision!==value.changes.length)throw new Error("Invalid ASEN workspace revision");return {schema:SCHEMA,revision:Number(value.revision),changes:structuredClone(value.changes as StoredWorkspaceChange[])};
}
async function read(file:string):Promise<WorkspaceFile>{if(!await preparePrivateFile(file))return empty();return parseWorkspaceFile(await readFile(file,"utf8"));}
async function write(file:string,value:WorkspaceFile){await preparePrivateFile(file,true);await atomicWriteText(file,`${JSON.stringify(value,null,2)}\n`);}

/** Durable attribution for successful child writes; records actor, owning session, project and worktree. */
export class PersistentWorkspaceStore{
 private constructor(readonly path:string,private readonly quarantined?:string){}
 static async open(path:string):Promise<PersistentWorkspaceStore>{await preparePrivateFile(path,true);let quarantined:string|undefined;try{await read(path);}catch(error){if(!(error instanceof SyntaxError)&&!(error instanceof Error&&["Invalid ASEN workspace store","Invalid ASEN workspace revision"].includes(error.message)))throw error;quarantined=`${path}.corrupt-${Date.now()}-${randomUUID()}`;await rename(path,quarantined);}return new PersistentWorkspaceStore(path,quarantined);}
 diagnostics(){return this.quarantined?{quarantined:this.quarantined}:undefined;}
 async append(change:WorkspaceChange):Promise<StoredWorkspaceChange>{const checked=recordWorkspaceChange(change);let saved:StoredWorkspaceChange|undefined;await preparePrivateFile(this.path,true);await withExclusiveFileLock(this.path,async()=>{const current=await read(this.path);if(current.changes.length>=MAX_CHANGES)throw new Error("ASEN workspace history has reached its limit");saved={revision:current.revision+1,id:`change-${randomUUID()}`,change:checked};const next=parseWorkspaceFile(JSON.stringify({schema:SCHEMA,revision:current.revision+1,changes:[...current.changes,saved]}));await write(this.path,next);});return structuredClone(saved!);}
 async list(identity:WorkspaceIdentity):Promise<readonly StoredWorkspaceChange[]>{const value=await read(this.path);return value.changes.filter(item=>item.change.sessionId===identity.sessionId&&sameWorkspaceIdentityPath(item.change.projectId,identity.projectId)&&sameWorkspaceIdentityPath(item.change.worktree,identity.worktree)).map(item=>structuredClone(item));}
}
