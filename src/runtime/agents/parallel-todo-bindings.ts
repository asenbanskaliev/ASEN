/** Pure source-Todo selection for T06. A mapping is audit evidence only;
 * it cannot authorize a Writer in the newly created worktree. */
import type {SessionTodoStore,TodoContext} from "../lifecycle/todo-store.js";
import {validateParallelWorkerUnits,type ParallelWorkerUnit} from "./parallel-worktrees.js";
import {sameWorkspaceIdentityPath} from "../workspace-store.js";

export type SourceTodoRow=Awaited<ReturnType<SessionTodoStore["list"]>>[number];
export interface BoundParallelTodo{
 readonly taskId:string;readonly requestId:string;readonly taskRevision:number;
 readonly baseRevision:string;readonly writeSurfaces:readonly string[];
 readonly authority:"none";readonly needsNewWorktreePlan:true;
}
const valid=(value:unknown):value is string=>typeof value==="string"&&!!value&&value.length<=1024&&
 value===value.trim()&&value===value.normalize("NFC")&&!/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(value);
const sha=(value:unknown):value is string=>typeof value==="string"&&/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(value);
type SourceBindingInput={
 readonly identity:TodoContext;readonly expectedHead:string;
 readonly rows:readonly SourceTodoRow[];readonly units:readonly ParallelWorkerUnit[];
};
function sourceIndex(input:Pick<SourceBindingInput,"identity"|"expectedHead"|"rows">):Map<string,SourceTodoRow>{
 const {identity,expectedHead,rows}=input;
 if(!valid(identity?.sessionId)||!valid(identity?.projectId)||!sha(expectedHead)||
  !Array.isArray(rows))
  throw new Error("Invalid identity, pinned HEAD or number of Todo Worker tasks");
 const byId=new Map<string,SourceTodoRow>();
 for(const row of rows){
  if(!row||typeof row.taskId!=="string"||byId.has(row.taskId))
   throw new Error("Duplicate or invalid persisted Todo identity");
  byId.set(row.taskId,row);
 }
 return byId;
}
function bindUnits(input:SourceBindingInput,byId:ReadonlyMap<string,SourceTodoRow>):readonly BoundParallelTodo[]{
 const {identity,expectedHead,units}=input;
 const used=new Set<string>();
 return Object.freeze(units.map(unit=>{
  if(!unit||!valid(unit.taskId)||used.has(unit.taskId)||!Array.isArray(unit.writeSurfaces))
   throw new Error("Invalid or duplicate Todo worktree mapping");
  used.add(unit.taskId);
  const row=byId.get(unit.taskId);
  if(!row||row.current?.state!=="planned"||row.current.sessionId!==identity.sessionId||
   !sameWorkspaceIdentityPath(row.current.projectId,identity.projectId)||!Number.isSafeInteger(row.current.revision)||
   !row.plan||row.plan.role!=="worker"||
   row.plan.skillSelection?.phase!=="apply"||!valid(row.requestId)||
   !row.requestId.startsWith("asen-plan:")||!row.requestId.endsWith(":worker")||
   !row.plan.candidate||!sameWorkspaceIdentityPath(row.plan.candidate.repository,identity.projectId)||
   row.plan.candidate.revision!==expectedHead||!sha(row.plan.candidate.revision)||
   typeof row.plan.writerAuthorizationBasis!=="string"||!row.plan.writerAuthorizationBasis||
   !Array.isArray(row.plan.writeSurfaces)||
   row.plan.writeSurfaces.length!==unit.writeSurfaces.length||
   row.plan.writeSurfaces.some((scope,i)=>scope!==unit.writeSurfaces[i]))
   throw new Error("Source Todo must be a current, candidate-bound, planned Worker with identical ODD scopes");
  for(const predecessorId of row.dependsOn??[]){
   const predecessor=byId.get(predecessorId);
   if(!predecessor||!["done","succeeded"].includes(predecessor.current?.state??"")||
    predecessor.current.sessionId!==identity.sessionId||
    !sameWorkspaceIdentityPath(predecessor.current.projectId,identity.projectId))
    throw new Error("Source Todo has an incomplete or mismatched prerequisite");
  }
  return Object.freeze({
   taskId:row.taskId,requestId:row.requestId,taskRevision:row.current.revision,
   baseRevision:expectedHead,writeSurfaces:Object.freeze([...unit.writeSurfaces]),
   authority:"none" as const,needsNewWorktreePlan:true as const
  });
 }));
}
export function bindParallelSourceTodos(input:SourceBindingInput):readonly BoundParallelTodo[]{
 if(!Array.isArray(input.units)||input.units.length<2||input.units.length>4)
  throw new Error("Invalid number of Todo Worker tasks");
 const byId=sourceIndex(input);
 const bound=bindUnits(input,byId);
 validateParallelWorkerUnits(input.identity.projectId,input.units);
 return bound;
}

/** Escoge el primer par compatible en el orden del diario, sin modificarlo.
 * Una dependencia incompleta, otro candidato o una reserva anterior no deben
 * impedir que otras unidades válidas puedan prepararse.
 */
export function selectReadyParallelSourcePair(input:Omit<SourceBindingInput,"units">&{
 readonly excludedTaskIds?:ReadonlySet<string>;
}):readonly ParallelWorkerUnit[]{
 const byId=sourceIndex(input);
 const eligible:ParallelWorkerUnit[]=[];
 for(const row of input.rows){
  if(input.excludedTaskIds?.has(row.taskId)||row.current.state!=="planned"||
    row.plan?.role!=="worker"||!row.plan.writeSurfaces?.length)continue;
  const unit={taskId:row.taskId,writeSurfaces:row.plan.writeSurfaces};
  try{
   bindUnits({...input,units:[unit]},byId);
   eligible.push(validateParallelWorkerUnits(input.identity.projectId,[unit])[0]!);
  }catch{/* La unidad no es admisible; no se cambia su estado. */}
 }
 for(let i=0;i<eligible.length;i++)for(let j=i+1;j<eligible.length;j++){
  try{return validateParallelWorkerUnits(input.identity.projectId,[eligible[i]!,eligible[j]!]);}
  catch{/* Solapamiento: probar la siguiente combinación sin conceder autoridad. */}
 }
 return Object.freeze([]);
}
export function sameSourceTodoBindings(left:readonly BoundParallelTodo[],right:readonly BoundParallelTodo[]):boolean{
 return JSON.stringify(left)===JSON.stringify(right);
}
