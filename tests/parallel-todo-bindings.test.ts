import test from "node:test";
import assert from "node:assert/strict";
import {bindParallelSourceTodos,selectReadyParallelSourcePair,sameSourceTodoBindings,type SourceTodoRow} from "../src/runtime/agents/parallel-todo-bindings.js";

const root="/tmp/source-project",head="a".repeat(40),identity={sessionId:"session-a",projectId:root};
const scopes=[{taskId:"todo-1",writeSurfaces:["backend/a.ts"]},{taskId:"todo-2",writeSurfaces:["frontend/a.ts"]}];
function worker(taskId:string,scope:string,revision=1):SourceTodoRow{
 const requestId="asen-plan:"+taskId+":worker";
 const current={taskId,sessionId:"session-a",projectId:root,revision,state:"planned",at:"2026-11-15T18:00:00.000Z"};
 return {taskId,title:"Work "+taskId,requestId,description:"Work scope",
  events:[current],current,plan:{
   role:"worker",skillPaths:["skills/asen-apply/SKILL.md"],
   skillSelection:{phase:"apply",codeChange:true},
   candidate:{id:"candidate",repository:root,revision:head,createdAt:"2026-11-15T18:00:00.000Z"},
   writeSurfaces:[scope],writerAuthorizationBasis:'{"instruction":"test"}'
  }} as unknown as SourceTodoRow;
}
test("T06 linked worktrees bind exact candidate and scopes to planned source Todos without granting authority",()=>{
 const rows=[worker("todo-1","backend/a.ts"),worker("todo-2","frontend/a.ts")];
 const mapped=bindParallelSourceTodos({identity,expectedHead:head,rows,units:scopes});
 assert.deepEqual(mapped.map(x=>x.taskId),["todo-1","todo-2"]);
 assert.equal(mapped[0]!.taskRevision,1);
 assert.equal(mapped[0]!.authority,"none");
 assert.equal(mapped[0]!.needsNewWorktreePlan,true);
 assert.equal(sameSourceTodoBindings(mapped,bindParallelSourceTodos({identity,expectedHead:head,rows,units:scopes})),true);
 assert.equal(JSON.stringify(rows),JSON.stringify([worker("todo-1","backend/a.ts"),worker("todo-2","frontend/a.ts")]));
});
test("T06 source mapping rejects stale Todo state, candidate and per-file scope",()=>{
 const first=worker("todo-1","backend/a.ts"),second=worker("todo-2","frontend/a.ts");
 const cases=[
  [{...first,current:{...first.current,state:"running"}},second],
  [{...first,current:{...first.current,revision:1,sessionId:"session-b"}},second],
  [{...first,plan:{...first.plan!,candidate:{...first.plan!.candidate!,revision:"b".repeat(40)}}},second],
  [{...first,plan:{...first.plan!,writeSurfaces:["backend/other.ts"]}},second],
  [{...first,plan:{...first.plan!,role:"reviewer"}},second],
  [{...first,requestId:"user:forged"},second]
 ];
 for(const rows of cases)assert.throws(()=>bindParallelSourceTodos({identity,expectedHead:head,rows:rows as SourceTodoRow[],units:scopes}),/Source Todo/u);
});
test("T06 source mapping fails on missing, duplicate or unmet dependency",()=>{
 const first=worker("todo-1","backend/a.ts"),second=worker("todo-2","frontend/a.ts");
 assert.throws(()=>bindParallelSourceTodos({identity,expectedHead:head,rows:[first],units:scopes}),/Source Todo/u);
 assert.throws(()=>bindParallelSourceTodos({identity,expectedHead:head,rows:[first,first,second],units:scopes}),/Duplicate/u);
 assert.throws(()=>bindParallelSourceTodos({identity,expectedHead:head,rows:[first,second],units:[scopes[0]!,scopes[0]!]}),/duplicate/u);
 const prerequisite=worker("prerequisite","prerequisite.ts");
 const blocked={...first,dependsOn:[prerequisite.taskId]} as SourceTodoRow;
 assert.throws(()=>bindParallelSourceTodos({identity,expectedHead:head,rows:[blocked,second,prerequisite],units:scopes}),/incomplete/u);
 const done={...prerequisite,current:{...prerequisite.current,state:"done"}} as SourceTodoRow;
 const result=bindParallelSourceTodos({identity,expectedHead:head,rows:[blocked,second,done],units:scopes});
 assert.equal(result.length,2);
});

test("Megatanda B: omite una unidad dependiente y elige dos listas sin alterar el diario",()=>{
 const first=worker("todo-1","backend/a.ts"),second=worker("todo-2","frontend/a.ts");
 const third={...worker("todo-3","integration.ts"),dependsOn:[first.taskId,second.taskId]};
 const rows=[third,first,second];
 const before=JSON.stringify(rows);
 const selected=selectReadyParallelSourcePair({identity,expectedHead:head,rows});
 assert.deepEqual(selected.map(u=>u.taskId),["todo-1","todo-2"]);
 assert.equal(JSON.stringify(rows),before);
 assert.equal(bindParallelSourceTodos({identity,expectedHead:head,rows,units:selected}).length,2);
});

test("Megatanda B: encuentra una pareja aunque las primeras unidades se solapen por rutas o mayúsculas",()=>{
 const rows=[worker("todo-1","src/API"),worker("todo-2","src/api/a.ts"),worker("todo-3","docs/a.md")];
 assert.deepEqual(selectReadyParallelSourcePair({identity,expectedHead:head,rows}).map(u=>u.taskId),["todo-1","todo-3"]);
 assert.deepEqual(selectReadyParallelSourcePair({identity,expectedHead:head,rows,excludedTaskIds:new Set(["todo-1"])}).map(u=>u.taskId),["todo-2","todo-3"]);
 assert.deepEqual(selectReadyParallelSourcePair({identity,expectedHead:head,rows:rows.slice(0,2)}),[]);
});

test("Megatanda B: rechaza candidato antiguo y duplicidad; no convierte una dependencia fallida en disponible",()=>{
 const a=worker("todo-1","a.ts"),b=worker("todo-2","b.ts"),c=worker("todo-3","c.ts");
 const stale={...a,plan:{...a.plan!,candidate:{...a.plan!.candidate!,revision:"b".repeat(40)}}} as SourceTodoRow;
 const failed={...a,current:{...a.current,state:"failed"}} as SourceTodoRow;
 const dependent={...c,dependsOn:[a.taskId]};
 assert.deepEqual(selectReadyParallelSourcePair({identity,expectedHead:head,rows:[stale,b,c]}).map(u=>u.taskId),["todo-2","todo-3"]);
 assert.deepEqual(selectReadyParallelSourcePair({identity,expectedHead:head,rows:[failed,b,dependent]}),[]);
 assert.throws(()=>selectReadyParallelSourcePair({identity,expectedHead:head,rows:[a,a,b]}),/Duplicate/u);
});
