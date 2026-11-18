import type {AsenPanelSnapshot} from "./ide-panel.js";

/** Pérdida de observación: cero elementos no significa cero tareas verificadas.
 * Este valor se usa tanto en la ruta Pi como en las pruebas de la vista. */
export function unavailableT11RailSnapshot():AsenPanelSnapshot{
 return {todos:[],agents:[],jobs:[],activityUnavailable:true,agentFlowUnavailable:true};
}

/** T11/T07: también observar cuando el usuario ve la fila compacta.
 * Nunca activar sondeos de red/diarios con la presentación oculta. */
export function shouldObserveT11Surface(input:Readonly<{
 railActive:boolean;compactWidget:boolean;position:"auto"|"right"|"bottom"|"hidden";
 preset:"light"|"neutral"|"power";
}>):boolean{
 return input.railActive||input.compactWidget&&input.position!=="hidden"&&
  !(input.position==="auto"&&input.preset==="light");
}

/** Un refresco local solo puede preservar la observación de hijos reciente.
 * Si envejeció, "desconocido" es distinto de "no hay agentes".
 * No se arrastran Git, permisos, revisiones ni estado local del panel previo. */
export function combineT11LocalWithChild(
 local:Pick<AsenPanelSnapshot,"todos"|"agents"|"jobs">,
 previous:AsenPanelSnapshot|undefined,childFresh:boolean
):AsenPanelSnapshot{
 const base={todos:local.todos,agents:local.agents,jobs:local.jobs};
 if(previous?.agentFlowUnavailable===true)return {...base,agentFlowUnavailable:true};
 if(previous?.agentFlow)return childFresh?
  {...base,agentFlow:previous.agentFlow}:{...base,agentFlowUnavailable:true};
 // Ningún diario leído NO equivale a un diario leído y vacío.
 // Esto afecta al primer render del modo compacto y al cambio de sesión.
 return {...base,agentFlowUnavailable:true};
}

/** Caducidad observable incluso si Pi permanece sin turnos y no hay nuevos
 * refrescos locales. El temporizador no inicia Workers ni consulta proveedores.
 * Un callback antiguo jamás puede invalidar una lectura posterior. */
export function createT11ChildExpiryController(
 onExpire:()=>void,delayMs=12000
):Readonly<{renew:()=>void;clear:()=>void;stop:()=>void}>{
 if(!Number.isSafeInteger(delayMs)||delayMs<1||delayMs>30000)
  throw new Error("T11: plazo de caducidad no válido");
 let timer:ReturnType<typeof setTimeout>|undefined,version=0,stopped=false;
 const clear=()=>{
  version++;
  if(timer!==undefined)clearTimeout(timer);
  timer=undefined;
 };
 const renew=()=>{
  if(stopped)return;
  clear();
  const observedVersion=version;
  timer=setTimeout(()=>{
   timer=undefined;
   if(stopped||version!==observedVersion)return;
   version++;
   try{onExpire();}catch{/* Una vista auxiliar no debe interrumpir Pi. */}
  },delayMs);
  timer.unref?.();
 };
 const stop=()=>{stopped=true;clear();};
 return {renew,clear,stop};
}

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
