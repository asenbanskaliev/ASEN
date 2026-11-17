import type {AsenPanelSnapshot} from "./ide-panel.js";

export interface T11RailObserver{
 readonly refreshNow:()=>Promise<void>;
 readonly stop:()=>void;
}
/** Observación pasiva del lateral. Nunca inicia un agente ni concede permisos.
 * Comprueba la sesión ANTES y DESPUÉS de cada lectura asíncrona. */
export function createT11RailObserver(options:{
 readonly active:()=>boolean;
 readonly current:()=>boolean;
 readonly read:()=>Promise<AsenPanelSnapshot>;
 readonly onSnapshot:(snapshot:AsenPanelSnapshot)=>void;
 readonly onUnavailable:()=>void;
 readonly intervalMs?:number;
 readonly autoStart?:boolean;
}):T11RailObserver{
 const ms=Math.max(1000,Math.min(30000,Math.floor(options.intervalMs??5000)));
 let stopped=false,busy=false,timer:ReturnType<typeof setTimeout>|undefined;
 const stop=()=>{stopped=true;if(timer!==undefined)clearTimeout(timer);timer=undefined;};
 const current=()=>{try{return options.current();}catch{return false;}};
 const active=()=>{try{return options.active();}catch{return false;}};
 const refreshNow=async()=>{
  if(stopped||busy||!active())return;
  if(!current()){stop();return;}
  busy=true;
  try{
   const snapshot=await options.read();
   if(stopped)return;
   if(!current()){stop();return;}
   if(active())options.onSnapshot(snapshot);
  }catch{
   if(stopped)return;
   if(!current()){stop();return;}
   if(active())try{options.onUnavailable();}catch{/* La interfaz no puede bloquear Pi. */}
  }finally{busy=false;}
 };
 const schedule=()=>{
  if(stopped||options.autoStart===false)return;
  timer=setTimeout(()=>{timer=undefined;void refreshNow().finally(schedule);},ms);
  timer.unref?.();
 };
 schedule();
 return {refreshNow,stop};
}
