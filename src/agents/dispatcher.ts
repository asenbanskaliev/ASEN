import { validateWriteGrant, type WriteGrant } from "../policies/scopes.js";

export interface AgentRequest { id:string; role:"explorer"|"worker"|"reviewer"|"verifier"; prompt:string; repository:string; writeSurfaces?:string[]; isolationKey?:string; }
export interface AgentResult { id:string; ok:boolean; output:string; }
export interface AgentRunner { run(request:AgentRequest):Promise<AgentResult>; }

export class Dispatcher {
 readonly #active:WriteGrant[]=[]; #running=0; readonly #waiters:Array<()=>void>=[];
 constructor(private readonly runner:AgentRunner,private readonly maxConcurrency=4){if(!Number.isInteger(maxConcurrency)||maxConcurrency<1)throw new Error("maxConcurrency must be a positive integer");}
 async #acquire():Promise<void>{if(this.#running<this.maxConcurrency){this.#running++;return;}await new Promise<void>(resolve=>this.#waiters.push(resolve));this.#running++;}
 #release():void{this.#running--;this.#waiters.shift()?.();}
 async dispatch(request:AgentRequest):Promise<AgentResult>{
  await this.#acquire();let grant:WriteGrant|undefined;
  try{
   if(request.writeSurfaces){grant={agentId:request.id,repository:request.repository,surfaces:request.writeSurfaces};if(request.isolationKey)grant.isolationKey=request.isolationKey;validateWriteGrant(grant,this.#active);this.#active.push(grant);}
   return await this.runner.run(request);
  } finally {if(grant){const i=this.#active.indexOf(grant);if(i>=0)this.#active.splice(i,1);}this.#release();}
 }
}
