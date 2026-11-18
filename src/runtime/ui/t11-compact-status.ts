/** T11-C: una sola línea compacta, con prioridad a estados verificables.
 * No sustituye el pie de Pi, ni lee permisos, modelos o credenciales.
 */
import type {AsenPanelSnapshot} from "./ide-panel.js";
import {sanitizeTerminalText,truncateForTerminal,visibleWidth} from "../responsive-layout.js";

export interface T11StatusOptions{readonly headerAtTop?:boolean;readonly panelCommand?:boolean;readonly activityUnavailable?:boolean;readonly agentFlowUnavailable?:boolean}
type Segment={text:string;priority:number};
function clean(text:string,limit=60):string{
 return truncateForTerminal(sanitizeTerminalText(text).replace(/\s+/gu," ").trim(),limit);
}
export function renderAsenT11CompactStatus(
 snapshot:AsenPanelSnapshot,width:number,options:T11StatusOptions={}
):string{
 if(!Number.isSafeInteger(width)||width<1||width>1000)throw Error("Invalid T11 status width");
 const host=snapshot.hostStatus,items:Segment[]=[];
 // La pérdida de la fuente prevalece sobre contadores recibidos antes del fallo.
 const activityUnavailable=options.activityUnavailable===true||snapshot.activityUnavailable===true;
 const ctx=host?.context;
 if(activityUnavailable)
  items.push({text:"! actividad no disponible",priority:0});
 else if(options.agentFlowUnavailable===true||snapshot.agentFlowUnavailable===true)
  items.push({text:"! hijos no disponibles",priority:-1});
 if(ctx?.state==="warning"||ctx?.state==="error")
  items.push({text:"! ctx "+(ctx.percent===null?"?":Math.round(ctx.percent)+"%"),priority:0});
 const blocked=activityUnavailable?0:snapshot.todos.filter(x=>x.current.state==="blocked").length;
 const interrupted=activityUnavailable?0:snapshot.agents.filter(x=>x.state==="failed"||x.state==="interrupted").length;
 // Solo contar bloqueos hijos si la observación es válida y actual.
 // No reutilizar el último contador durante una pérdida de la fuente.
 const childTrusted=!activityUnavailable&&options.agentFlowUnavailable!==true&&
  snapshot.agentFlowUnavailable!==true;
 const childBlocked=childTrusted?(snapshot.agentFlow?.overview.stages.blocked??0):0;
 if(interrupted||blocked||childBlocked)
  items.push({text:"! "+(interrupted+blocked+childBlocked)+" bloqueos",priority:-2});
 if(!activityUnavailable&&snapshot.review?.pending&&Number.isSafeInteger(snapshot.review.pending)&&snapshot.review.pending>0)
  items.push({text:"! "+snapshot.review.pending+" revisiones",priority:0});
 const permission=snapshot.permission;
 if(permission&&permission.toLowerCase()!=="normal")
  items.push({text:"modo "+clean(permission,18),priority:1});
 if(host){
  const model=host.selectedModel;
  items.push({text:"modelo "+(model?clean(model.provider+"/"+model.model,38):"?")+
   (host.effectiveThinking?" · "+clean(host.effectiveThinking,12):""),priority:2});
  if(ctx?.state!=="warning"&&ctx?.state!=="error")
   items.push({text:"ctx "+(ctx?.percent===null||ctx===undefined?"?":Math.round(ctx.percent)+"%"),priority:3});
  items.push({
   text:"respuesta "+(host.respondingModel?clean(host.respondingModel.provider+"/"+host.respondingModel.model,32):"?"),
   priority:4
  });
 }else if(snapshot.model)items.push({text:"modelo "+clean(snapshot.model,38),priority:2});
 if(snapshot.changes)items.push({
  text:"rama "+clean(snapshot.changes.branch,24)+(snapshot.changes.files?" ±"+snapshot.changes.files:""),
  priority:5
 });
 if(host)items.push({text:"coste/uso ?",priority:6});
 const ordered=items.sort((a,b)=>a.priority-b.priority);
 const separator=" · ";
 const access=options.panelCommand===false||width<21?"":"/asen-panel";
 const accessWidth=visibleWidth(access),reserved=access?accessWidth+visibleWidth(separator):0;
 const budget=Math.max(0,width-reserved);
 const parts:string[]=[];
 if(ordered.length&&budget>0&&visibleWidth(ordered[0]!.text)>budget){
  // El aviso prioritario no desaparece por culpa de un dato más corto.
  parts.push(truncateForTerminal(ordered[0]!.text,budget));
 }else{
  for(const item of ordered){
   let label=item.text;
   let next=parts.length?parts.join(separator)+separator+label:label;
   // Un bloqueo local no puede ocultar un fallo de la fuente de hijos.
   if(visibleWidth(next)>budget&&label==="! hijos no disponibles"){
    label="! hijos ?";
    next=parts.length?parts.join(separator)+separator+label:label;
   }
   if(visibleWidth(next)<=budget)parts.push(label);
  }
 }
 if(!parts.length&&ordered.length){
  const strongest=ordered[0]!.text;
  if(budget>0)parts.push(truncateForTerminal(strongest,budget));
 }
 if(!parts.length&&options.headerAtTop!==true&&(!access||visibleWidth("ASEN"+separator+access)<=width))
  parts.push("ASEN");
 let result=parts.join(separator);
 if(access)result+=result?separator+access:access;
 if(!result)result="ASEN";
 return truncateForTerminal(result,width);
}
