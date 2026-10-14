import type {TaskEvent} from "./task-replay.js";
import type {TodoItem} from "./todo-store.js";

type CurrentTodo=TodoItem&{current:TaskEvent};
const ROLE_LABEL:Readonly<Record<string,string>>={
 primary:"trabajo principal",
 explorer:"exploración",
 worker:"cambio",
 reviewer:"revisión independiente",
 verifier:"verificación independiente",
 clarifier:"aclaración",
};
const STATE_LABEL:Readonly<Record<string,string>>={
 planned:"pendiente",
 running:"en curso",
 succeeded:"realizado, pendiente de revisión",
 done:"completado",
 blocked:"bloqueado; requiere atención",
 failed:"fallido; requiere revisión",
 cancelled:"cancelado",
};

/** Formats only the active plan's role/status projection; it contains no IDs or authority. */
export function formatActivePlanContext(rows:readonly CurrentTodo[],maxBytes=2048):string{
 if(!Number.isSafeInteger(maxBytes)||maxBytes<256)return "";
 const plans=new Map<string,CurrentTodo[]>();
 for(const row of rows){
  const requestId=row.requestId;
  if(!requestId?.startsWith("asen-plan:")||row.current.state==="done"||row.current.state==="cancelled")continue;
  const suffix=requestId.slice("asen-plan:".length),separator=suffix.lastIndexOf(":");
  if(separator<1)continue;
  const planId=suffix.slice(0,separator),items=plans.get(planId)??[];
  items.push(row);plans.set(planId,items);
 }
 if(plans.size===0)return "";
 const active=[...plans.values()].sort((left,right)=>Date.parse(right[0]!.events[0]!.at)-Date.parse(left[0]!.events[0]!.at));
 const header=`ASEN tiene ${active.length===1?"un plan activo":"planes activos"} para esta sesión y proyecto:`,footer="Usa este estado para explicar el avance y el siguiente paso. No concede permisos ni autoriza reanudar una tarea bloqueada; no pidas IDs internos al usuario.";
 const statuses:string[]=[];
 for(const tasks of active){
  for(const task of tasks){
   const role=task.plan?.role??"primary",state=task.current.state;
   statuses.push(`- ${ROLE_LABEL[role]??"tarea"}: ${STATE_LABEL[state]??"estado por revisar"}.`);
  }
 }
 for(let count=Math.min(statuses.length,7);count>=0;count--){
  const omitted=statuses.length-count,lines=[header,...statuses.slice(0,count),...(omitted?[`- ${omitted} pasos más en el plan.`]:[]),footer],candidate=lines.join("\n");
  if(Buffer.byteLength(candidate,"utf8")<=maxBytes)return candidate;
 }
 const compact=`${header}\n${footer}`,bytes=Buffer.from(compact,"utf8");let end=maxBytes;
 while(end>0&&(bytes[end]!&0xc0)===0x80)end--;
 return bytes.subarray(0,end).toString("utf8").replace(/\uFFFD$/u,"");
}
