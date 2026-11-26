/** Última observación Git manual: nunca presentarla como estado en tiempo real.
 * No ejecuta Git, no modifica el árbol ni concede permisos.
 */
import type {AsenPanelSnapshot} from "./ide-panel.js";

type GitChanges=NonNullable<AsenPanelSnapshot["changes"]>;
export function createT11GitObservationCache(){
 let latest:Readonly<{sessionId:string;projectId:string;changes:Readonly<{branch:string;files:number}>}>|undefined;
 return {
  remember(sessionId:string,projectId:string,changes:GitChanges|undefined):void{
   // La ausencia de Git en una inspección explícita invalida la anterior.
   latest=sessionId&&projectId&&changes&&typeof changes.branch==="string"&&
    Number.isSafeInteger(changes.files)&&changes.files>=0?
    {sessionId,projectId,changes:{branch:changes.branch,files:changes.files}}:undefined;
  },
  restore(sessionId:string,projectId:string,snapshot:AsenPanelSnapshot):AsenPanelSnapshot{
   if(snapshot.activityUnavailable){latest=undefined;return snapshot;}
   if(!sessionId||!projectId||latest?.sessionId!==sessionId||latest.projectId!==projectId){
    latest=undefined;return snapshot;
   }
   // Una lectura manual fresca prevalece sobre la caché.
   if(snapshot.changes)return snapshot;
   return {...snapshot,changes:{...latest.changes,lastInspected:true}};
  },
  clear():void{latest=undefined;}
 };
}
