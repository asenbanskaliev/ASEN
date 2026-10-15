import assert from "node:assert/strict";
import test from "node:test";
import type {TodoItem} from "../src/runtime/todo-store.js";
import {todoProgressSummary,todoStatusRows} from "../src/runtime/todo-presentation.js";

function task(state:"planned"|"running"|"blocked"|"succeeded"|"done"|"cancelled",role:"explorer"|"worker"|"verifier"="explorer"){
 const item:TodoItem={taskId:"todo-secret-uuid",title:"Review the requested change",requestId:"asen-plan:secret:explorer",dependsOn:["todo-other-secret"],events:[{taskId:"todo-secret-uuid",sessionId:"session-a",projectId:"/project",revision:1,state,at:"2026-10-14T00:00:00.000Z",...(state==="blocked"?{reason:"Restart interrupted the task; review before continuing"}:{})}],plan:{role,skillPaths:[]}};
 return {...item,current:item.events[0]!};
}

test("Todo status shows useful Spanish labels without exposing internal IDs",()=>{
 const rows=todoStatusRows([task("blocked","worker")]);assert.match(rows[0]!,/Pausada; requiere revisión · Aplicación del cambio/u);assert.match(rows[0]!,/1 requisito\(s\) previo\(s\)/u);assert.doesNotMatch(rows.join("\n"),/todo-secret|todo-other-secret|asen-plan/u);
});

test("plan progress describes running, blocked and completed work in plain language",()=>{
 assert.match(todoProgressSummary([task("running")]),/está trabajando/u);
 assert.match(todoProgressSummary([task("blocked")]),/No las repetirá automáticamente.*di «continúa».*pediré confirmación/u);
 assert.doesNotMatch(todoProgressSummary([task("blocked")]),/\/asen-/u);
 const completed=todoProgressSummary([task("done","explorer")]);
 assert.match(completed,/completó 1 tarea; no quedan pasos pendientes/u);
 assert.doesNotMatch(completed,/verificó|plan/u);
 assert.match(todoProgressSummary([task("done"),task("cancelled")]),/1 tarea completada y 1 tarea cancelada/u);
});
