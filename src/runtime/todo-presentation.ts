import type {TodoItem} from "./todo-store.js";

const MAX_ROWS=100;
function clean(value:string):string{return value.replace(/[\u0000-\u001f\u007f-\u009f]+/gu," ").replace(/\s+/gu," ").trim();}

/** Bounded, read-only Pi command projection; store filtering already binds the active session and project. */
export function todoStatusRows(items:readonly (TodoItem&{current:TodoItem["events"][number]})[],width=160):string[]{
 if(!Number.isInteger(width)||width<48)throw new Error("Todo status width must be at least 48 characters");
 const rows=items.slice(0,MAX_ROWS).map(item=>{
  const status:Record<string,string>={planned:"Pendiente",running:"En curso",succeeded:"Ejecutada; pendiente de revisión",blocked:"Pausada; requiere revisión",done:"Completada",cancelled:"Cancelada"},roles:Record<string,string>={primary:"Tarea principal",explorer:"Exploración",worker:"Aplicación del cambio",reviewer:"Revisión",verifier:"Verificación",clarifier:"Aclaración"};
  const prefix=`${status[item.current.state]??"Estado"} · ${item.plan?roles[item.plan.role]??"Tarea": "Tarea"}: `,dependencies=item.dependsOn?.length?`${item.dependsOn.length} requisito(s) previo(s)`:"",detail=[clean(item.title),dependencies,item.current.reason?clean(item.current.reason):""].filter(Boolean).join(" — ");
  return (prefix+(detail.length+prefix.length>width?`${detail.slice(0,Math.max(0,width-prefix.length-1))}…`:detail)).slice(0,width);
 });
 if(items.length>MAX_ROWS)rows.push(`… ${items.length-MAX_ROWS} tareas adicionales omitidas`);
 return rows;
}

export function todoProgressSummary(items:readonly (TodoItem&{current:TodoItem["events"][number]})[]):string{
 if(!items.length)return "ASEN: no hay tareas activas para este proyecto y sesión.";
 const completed=items.filter(item=>item.current.state==="done").length,cancelled=items.filter(item=>item.current.state==="cancelled").length,waiting=items.filter(item=>item.current.state==="blocked").length,running=items.filter(item=>item.current.state==="running").length;
 const count=(amount:number,noun:string)=>`${amount} ${noun}${amount===1?"":"s"}`;
 if(waiting)return `ASEN pausó el trabajo para revisar ${count(waiting,"tarea")}. No las repetirá automáticamente. Si quieres retomarlas, di «continúa»; reanudaré las tareas de solo lectura que sean seguras y te preguntaré solo si hace falta una escritura o una decisión importante.`;
 if(running)return `ASEN está trabajando: ${completed} de ${items.length} ${items.length===1?"tarea completada":"tareas completadas"}.`;
 if(completed+cancelled===items.length)return cancelled?`ASEN cerró el trabajo: ${count(completed,"tarea")} completada${completed===1?"":"s"} y ${count(cancelled,"tarea")} cancelada${cancelled===1?"":"s"}.`:`ASEN completó ${count(completed,"tarea")}; no quedan pasos pendientes.`;
 return `ASEN lleva ${completed} de ${items.length} tareas completadas; continuará con el siguiente paso disponible.`;
}

/** Compact Pi editor widget for active work; it exposes progress, never task IDs or permissions. */
export function todoProgressWidget(items:readonly (TodoItem&{current:TodoItem["events"][number]})[],maxRows=3,validatingTaskId?:string):string[]|undefined{
 if(!Number.isInteger(maxRows)||maxRows<1||maxRows>8)throw new Error("Todo widget row limit must be between 1 and 8");
 const active=items.filter(item=>item.current.state!=="done"&&item.current.state!=="cancelled");
 if(!active.length)return undefined;
 const running=active.filter(item=>item.current.state==="running").length,blocked=active.filter(item=>item.current.state==="blocked").length;
 const header=`ASEN · ${active.length} ${active.length===1?"paso activo":"pasos activos"}${running?` · ${running} en curso`:""}${blocked?` · ${blocked} pausado${blocked===1?"":"s"}`:""}`;
 const rows=active.slice(0,maxRows).map(item=>{
  const state:Record<string,string>={planned:"Pendiente",running:"En curso",succeeded:"En revisión",blocked:"Pausado",failed:"Fallido"},role:Record<string,string>={primary:"Tarea",explorer:"Exploración",worker:"Cambio",reviewer:"Revisión",verifier:"Verificación",clarifier:"Aclaración"};
  const activity=item.taskId===validatingTaskId&&item.current.state==="running"?" · Comprobando":"",label=`${state[item.current.state]??"Pendiente"} · ${role[item.plan?.role??"primary"]??"Tarea"}${activity}: `,title=clean(item.title),available=Math.max(1,100-label.length),visible=title.length>available?`${title.slice(0,available-1)}…`:title;
  return `${label}${visible}`;
 });
 if(active.length>maxRows)rows.push(`y ${active.length-maxRows} paso${active.length-maxRows===1?"":"s"} más`);
 return [header,...rows];
}
