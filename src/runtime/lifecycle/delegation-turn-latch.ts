import type {DelegationMode} from "./profiles.js";

/** Mantiene inmutable el modo del padre durante un turno de Pi.
 * No concede permisos: la política del anfitrión sigue siendo la única
 * barrera de edición y cada Writer necesita su propia autorización.
 */
export class DelegationTurnLatch{
 #epoch=0;
 readonly #cached=new Map<string,DelegationMode>();
 readonly #pending=new Map<string,Promise<DelegationMode>>();
 /** Versión solo de lectura: un nuevo turno invalida llamadas todavía pendientes. */
 get epoch():number{return this.#epoch;}

 /** Una nueva entrada o sesión invalida los modos anteriores, nunca los permisos. */
 nextTurn():void{this.#epoch++;this.#cached.clear();this.#pending.clear();}

 async mode(
  identity:Readonly<{sessionId:string;projectId:string}>,
  load:()=>Promise<DelegationMode>,
  verify:()=>Promise<void>,
 ):Promise<DelegationMode>{
  const {sessionId,projectId}=identity;
  if(!sessionId||!projectId||sessionId.includes("\0")||projectId.includes("\0"))
   throw new Error("Falta la identidad exacta de sesión y proyecto");
  const key=sessionId+"\0"+projectId,epoch=this.#epoch;
  const ensureCurrent=async()=>{
   if(this.#epoch!==epoch)throw new Error("El turno del perfil ha cambiado");
   await verify();
   if(this.#epoch!==epoch)throw new Error("El turno del perfil ha cambiado");
  };
  const known=this.#cached.get(key);
  if(known!==undefined){await ensureCurrent();return known;}
  const inflight=this.#pending.get(key);
  if(inflight){const mode=await inflight;await ensureCurrent();return mode;}
  const request=(async()=>{
   const loaded=await load();
   if(loaded!=="organic"&&loaded!=="full-delegation")
    throw new Error("Modo de delegación no válido");
   await ensureCurrent();
   this.#cached.set(key,loaded);
   return loaded;
  })();
  this.#pending.set(key,request);
  try{return await request;}
  finally{if(this.#pending.get(key)===request)this.#pending.delete(key);}
 }
}
