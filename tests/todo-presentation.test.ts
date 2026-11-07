import assert from "node:assert/strict";
import test from "node:test";
import type {TodoItem} from "../src/runtime/todo-store.js";
import {todoProgressSummary,todoProgressWidget,todoStatusRows} from "../src/runtime/todo-presentation.js";
import {sanitizeTerminalText,visibleWidth} from "../src/runtime/responsive-layout.js";

function task(state:"planned"|"running"|"blocked"|"succeeded"|"done"|"cancelled",role:"explorer"|"worker"|"verifier"="explorer"){
 const item:TodoItem={taskId:"todo-secret-uuid",title:"Review the requested change",requestId:"asen-plan:secret:explorer",dependsOn:["todo-other-secret"],events:[{taskId:"todo-secret-uuid",sessionId:"session-a",projectId:"/project",revision:1,state,at:"2026-10-14T00:00:00.000Z",...(state==="blocked"?{reason:"Restart interrupted the task; review before continuing"}:{})}],plan:{role,skillPaths:[]}};
 return {...item,current:item.events[0]!};
}

test("Todo status shows useful Spanish labels without exposing internal IDs",()=>{
 const rows=todoStatusRows([task("blocked","worker")]);assert.match(rows[0]!,/Pausada; requiere revisión · Aplicación del cambio/u);assert.match(rows[0]!,/1 requisito\(s\) previo\(s\)/u);assert.doesNotMatch(rows.join("\n"),/todo-secret|todo-other-secret|asen-plan/u);
});

test("plan progress describes running, blocked and completed work in plain language",()=>{
 assert.match(todoProgressSummary([task("running")]),/está trabajando/u);
 assert.match(todoProgressSummary([task("blocked")]),/No las repetirá automáticamente.*di «continúa».*solo si hace falta una escritura/u);
 assert.doesNotMatch(todoProgressSummary([task("blocked")]),/\/asen-/u);
 const completed=todoProgressSummary([task("done","explorer")]);
 assert.match(completed,/completó 1 tarea; no quedan pasos pendientes/u);
 assert.doesNotMatch(completed,/verificó|plan/u);
 assert.match(todoProgressSummary([task("done"),task("cancelled")]),/1 tarea completada y 1 tarea cancelada/u);
});

test("active progress widget is compact, useful, and never exposes task or plan identifiers",()=>{
 const lines=todoProgressWidget([task("running"),task("blocked","worker")]);assert.ok(lines);assert.match(lines[0]!,/ASEN · 2 pasos activos · 1 en curso · 1 pausado/u);assert.match(lines[1]!,/En curso · Exploración/u);assert.doesNotMatch(lines.join("\n"),/todo-secret|todo-other-secret|asen-plan/u);assert.equal(todoProgressWidget([task("done")]),undefined);
});

test("Todo status rows fit terminal columns without splitting Unicode graphemes",()=>{
 const cases=["界".repeat(24),"👨‍👩‍👧‍👦".repeat(8),"e\u0301".repeat(30)];
 for(const title of cases){
  const item=task("planned");item.title=title;item.dependsOn=[];
  const [row]=todoStatusRows([item],48);
  assert.ok(row);assert.ok(visibleWidth(row)<=48,`${visibleWidth(row)} columns: ${row}`);
  assert.equal(row,sanitizeTerminalText(row));
  assert.doesNotMatch(row,/\p{Surrogate}/u);
  assert.doesNotMatch(row,/\u200d…$/u);
  if(title.startsWith("e\u0301"))assert.ok(row.endsWith("e\u0301…"));
 }
});

test("Todo rows sanitize unsafe formatting and retain a visible blocked reason",()=>{
 const item=task("blocked");item.title="x";item.dependsOn=[];delete item.plan;item.current.reason="wait\u001b[31m\n\u202e界";
 const [row]=todoStatusRows([item],48);
 assert.ok(row);assert.ok(visibleWidth(row)<=48);assert.equal(row,sanitizeTerminalText(row));
 assert.doesNotMatch(row,/[\u001b\n\u202e]/u);assert.match(row,/wait/u);
});

test("Todo widget applies the same 48-column Unicode and control safety",()=>{
 const item=task("blocked","worker");item.title="界👨‍👩‍👧‍👦e\u0301\u001b[31m\n\u202e".repeat(8);item.current.reason="blocked reason";
 const lines=todoProgressWidget([item],3,undefined,48);assert.ok(lines);
 for(const row of lines){assert.ok(visibleWidth(row)<=48,`${visibleWidth(row)} columns: ${row}`);assert.equal(row,sanitizeTerminalText(row));assert.doesNotMatch(row,/[\u001b\n\u202e]/u);assert.doesNotMatch(row,/\p{Surrogate}/u);assert.doesNotMatch(row,/\u200d…$/u);}
});

test("Todo presentation preserves ASCII state output, public calls, and input values",()=>{
 const items=[task("succeeded","verifier"),task("cancelled")];
 const before=structuredClone(items);
 assert.deepEqual(todoStatusRows(items),[
  "Ejecutada; pendiente de revisión · Verificación: Review the requested change — 1 requisito(s) previo(s)",
  "Cancelada · Exploración: Review the requested change — 1 requisito(s) previo(s)",
 ]);
 assert.deepEqual(todoProgressWidget(items,3,undefined,48),[
  "ASEN · 1 paso activo",
  "En revisión · Verificación: Review the requeste…",
 ]);
 assert.deepEqual(items,before);
});
