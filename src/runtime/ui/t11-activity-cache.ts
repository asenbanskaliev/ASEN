/** Datos de actividad observados: nunca cruzar sesiones ni conceder permisos. */
import type {AsenPanelSnapshot} from "./ide-panel.js";

export type T11Activity=Pick<AsenPanelSnapshot,"todos"|"agents"|"jobs">;
export interface T11ActivityCache{
 put(sessionId:string,projectId:string,activity:T11Activity):void;
 get(sessionId:string,projectId:string):T11Activity|undefined;
 clear():void;
}
export function createT11ActivityCache():T11ActivityCache{
 let latest:Readonly<{sessionId:string;projectId:string;activity:T11Activity}>|undefined;
 return {
  put(sessionId,projectId,activity){
   if(!sessionId||!projectId){latest=undefined;return;}
   latest={sessionId,projectId,activity:{
    todos:Object.freeze([...activity.todos]),
    agents:Object.freeze([...activity.agents]),
    jobs:Object.freeze([...activity.jobs]),
   }};
  },
  get(sessionId,projectId){
   return latest?.sessionId===sessionId&&latest?.projectId===projectId?latest.activity:undefined;
  },
  clear(){latest=undefined;}
 };
}
