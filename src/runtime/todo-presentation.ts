import type {TodoItem} from "./todo-store.js";

const MAX_ROWS=100;
function clean(value:string):string{return value.replace(/[\u0000-\u001f\u007f-\u009f]+/gu," ").replace(/\s+/gu," ").trim();}

/** Bounded, read-only Pi command projection; store filtering already binds the active session and project. */
export function todoStatusRows(items:readonly (TodoItem&{current:TodoItem["events"][number]})[],width=160):string[]{
 if(!Number.isInteger(width)||width<48)throw new Error("Todo status width must be at least 48 characters");
 const rows=items.slice(0,MAX_ROWS).map(item=>{
  const prefix=`${item.current.state.padEnd(10)} ${item.taskId} `,detail=[clean(item.title),item.current.reason?clean(item.current.reason):""].filter(Boolean).join(" — ");
  return (prefix+(detail.length+prefix.length>width?`${detail.slice(0,Math.max(0,width-prefix.length-1))}…`:detail)).slice(0,width);
 });
 if(items.length>MAX_ROWS)rows.push(`… ${items.length-MAX_ROWS} additional tasks omitted`);
 return rows;
}
