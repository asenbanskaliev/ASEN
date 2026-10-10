import {watch} from "node:fs";
import {realpath} from "node:fs/promises";
import type {RefreshSkillRegistryOptions,RefreshSkillRegistryResult} from "./generated-registry.js";

export interface RegistryWatch {close():void;on?(event:"error",listener:()=>void):unknown}
export interface RegistryLifecycleOptions {
 refresh:(options:RefreshSkillRegistryOptions)=>Promise<RefreshSkillRegistryResult>;
 prepare:(cwd:string)=>Promise<RefreshSkillRegistryOptions>;
 watch?:(root:string,changed:()=>void)=>RegistryWatch;
 debounceMs?:number;
}
export interface RegistrySession {cwd:string;hasUI?:boolean;ui:{notify(message:string,level:"info"|"error"):void}}
/** Serializes each project's existing cache writer; it never alters mandatory Skill selection. */
export class RegistryLifecycle {
 readonly #pending=new Set<Promise<unknown>>();readonly #queues=new Map<string,Promise<unknown>>();readonly #watchers:RegistryWatch[]=[];
 #generation=0;#timer:ReturnType<typeof setTimeout>|undefined;
 constructor(private readonly options:RegistryLifecycleOptions){if(options.debounceMs!==undefined&&(!Number.isSafeInteger(options.debounceMs)||options.debounceMs<0||options.debounceMs>60000))throw Error("Invalid registry debounce");}
 #notify(session:RegistrySession,message:string,level:"info"|"error"):void {if(session.hasUI)try{session.ui.notify(message,level);}catch{}}
 refresh(cwd:string):Promise<RefreshSkillRegistryResult> {
  const operation=this.#refresh(cwd);this.#pending.add(operation);void operation.then(()=>this.#pending.delete(operation),()=>this.#pending.delete(operation));return operation;
 }
 async #refresh(cwd:string):Promise<RefreshSkillRegistryResult> {
  const prepared=await this.options.prepare(cwd),root=prepared.projectRoot,prior=this.#queues.get(root)??Promise.resolve();
  const next=prior.catch(()=>{}).then(()=>this.options.refresh(prepared));this.#queues.set(root,next);
  try{return await next;}finally{if(this.#queues.get(root)===next)this.#queues.delete(root);}
 }
 #close():void {
  this.#generation++;if(this.#timer!==undefined)clearTimeout(this.#timer);this.#timer=undefined;
  for(const handle of this.#watchers.splice(0))try{handle.close();}catch{}
 }
 async shutdown():Promise<void>{this.#close();await Promise.allSettled([...this.#pending]);}
 async start(context:RegistrySession,disabled=false):Promise<void>{
  const session:RegistrySession={cwd:context.cwd,hasUI:context.hasUI===true,ui:{notify:context.ui.notify.bind(context.ui)}};
  this.#close();const generation=this.#generation;await Promise.allSettled([...this.#pending]);if(disabled||generation!==this.#generation)return;
  try{
   const observed=await this.refresh(session.cwd);if(generation!==this.#generation)return;
   this.#notify(session,`ASEN skill registry startup: skills=${observed.count}; cache=${observed.cache}; diagnostics=${observed.skipped.length}; memory=${observed.persistence.status}.`,"info");
   if(!session.hasUI)return;
   const prepared=await this.options.prepare(session.cwd);session.cwd=prepared.projectRoot;if(generation!==this.#generation)return;
   const watchSource=this.options.watch??((root:string,changed:()=>void)=>watch(root,{recursive:true,persistent:false},changed));
   let running=false,dirty=false;
   const refreshWatched=()=>{
    if(generation!==this.#generation)return;if(running){dirty=true;return;}running=true;
    void (async()=>{try{do{dirty=false;
     try{const result=await this.refresh(session.cwd);if(generation===this.#generation)this.#notify(session,`ASEN skill registry refreshed: skills=${result.count}; cache=${result.cache}; diagnostics=${result.skipped.length}.`,"info");}
     catch{if(generation===this.#generation)this.#notify(session,"ASEN skill registry watch refresh failed; use /asen-skill-registry refresh.","error");}
    }while(dirty&&generation===this.#generation);}finally{running=false;}})();
   };
   for(const source of prepared.sources){
    let root:string;try{root=await realpath(source.root);}catch{continue;}
    if(generation!==this.#generation)return;
    try{
     const handle=watchSource(root,()=>{
      if(generation!==this.#generation)return;
      if(this.#timer!==undefined)clearTimeout(this.#timer);
      this.#timer=setTimeout(()=>{this.#timer=undefined;refreshWatched();},this.options.debounceMs??500);this.#timer.unref();
     });
     handle.on?.("error",()=>{try{handle.close();}catch{}if(generation===this.#generation)this.#notify(session,"ASEN skill registry watcher unavailable; use /asen-skill-registry refresh.","error");});this.#watchers.push(handle);
    }catch{this.#notify(session,"ASEN skill registry watcher unavailable; use /asen-skill-registry refresh.","error");}
   }
  }catch{if(generation===this.#generation)this.#notify(session,"ASEN skill registry startup failed; use /asen-skill-registry refresh.","error");}
 }
}
export function registryStartupDisabled(flag:unknown,argv:readonly string[]=process.argv.slice(2),env:NodeJS.ProcessEnv=process.env):boolean {
 return flag===true||["1","true","yes","on"].includes(env.ASEN_NO_SKILL_REGISTRY??"")||argv.some(arg=>arg==="--no-skills"||arg==="-ns");
}
