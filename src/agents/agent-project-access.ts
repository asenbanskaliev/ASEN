import {realpath,stat} from "node:fs/promises";
import {isAbsolute} from "node:path";
import type {AgentSessionIdentity} from "./agent-runtime.js";

/** Foreign project access is a live-session permission, never restored from task records. */
export class AgentProjectAccess{
 #manager:unknown;#sessionId:string|undefined;readonly #roots=new Set<string>();
 reset():void{this.#manager=undefined;this.#sessionId=undefined;this.#roots.clear();}
 async resolve(root:unknown,context:any,current:AgentSessionIdentity,launch:boolean,confirm:()=>Promise<boolean>,signal?:AbortSignal):Promise<AgentSessionIdentity>{
  const abort=()=>{if(signal?.aborted)throw new Error("Agent project authorization cancelled");};abort();
  const manager=context?.sessionManager;
  if(this.#manager!==manager||this.#sessionId!==current.sessionId){this.reset();this.#manager=manager;this.#sessionId=current.sessionId;}
  if(root===undefined)return current;
  if(typeof root!=="string"||!root.trim()||!isAbsolute(root))throw new Error("Agent project root must be absolute");
  const target=await realpath(root);if(!(await stat(target)).isDirectory())throw new Error("Agent project root must be a directory");abort();
  if(target===current.projectId)return current;
  if(!this.#roots.has(target)){
   if(!launch)throw new Error("Foreign agent project permission is unavailable; start a new explicitly authorized task");
   if(context?.hasUI!==true||typeof context?.ui?.confirm!=="function"||await confirm()!==true)throw new Error("Explicit Pi UI confirmation is required for a foreign agent project");
   abort();
   if(this.#manager!==manager||this.#sessionId!==current.sessionId||context.sessionManager!==manager||manager.getSessionId()!==current.sessionId||await realpath(context.cwd)!==current.projectId)throw new Error("Agent session changed during project authorization");
   if(await realpath(root)!==target)throw new Error("Agent project root changed during authorization");
   this.#roots.add(target);
  }
  if(context.sessionManager!==this.#manager||manager.getSessionId()!==this.#sessionId)throw new Error("Agent project permission is no longer live");
  return {sessionId:current.sessionId,projectId:target};
 }
}
