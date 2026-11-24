import {deriveOddFacts,deriveOddPartitionUnitFacts,canMaterializeOddPartition,planOddRoute,type OddDerivedFacts,type OddRoutingRequest} from "../../flow/odd-routing.js";
import {buildOrchestrationPlan} from "../../orchestration/orchestrator.js";
import {materializeExecutablePlan,type ExecutablePlan,type PlannedTask} from "../../orchestration/executable-plan.js";
import type {Candidate} from "../../core/types.js";
import type {ProfileLayer} from "./profiles.js";

type ParentRequest=Record<string,unknown>&{instruction:string};
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const validInstruction=(value:unknown):value is string=>typeof value==="string"&&!!value&&value===value.trim()&&value.length<=8192&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value);
const sha=(value:unknown):value is string=>typeof value==="string"&&/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(value);
function instructionFor(parent:ParentRequest,objective:string):string{
 const text="Unidad ODD: "+objective+". Petición original (contexto; no amplía el ámbito de escritura): "+parent.instruction;
 if(!validInstruction(text)||("Perform only the authorized, scoped work for: "+text).length>4096)
  throw new Error("ODD unit instruction exceeds the safe Writer approval limit");
 return text;
}
export function isPartitionUnitBasis(value:unknown):boolean{
 return plain(value)&&(Object.hasOwn(value,"partitionOrigin")||Object.hasOwn(value,"unitId")||Object.hasOwn(value,"sourceRevision"));
}
/** Reconstruye la unidad a partir de los hechos completos. No acepta una
 * copia de hechos reducidos ni una ruta de escritura inventada por el modelo. */
export function parsePartitionUnitBasis(value:unknown,repository:string,revision:string){
 if(!plain(value)||Object.keys(value).length!==5||
  !["instruction","taskIdentity","partitionOrigin","unitId","sourceRevision"].every(key=>Object.hasOwn(value,key))||
  !plain(value.partitionOrigin)||!validInstruction(value.partitionOrigin.instruction)||
  typeof value.unitId!=="string"||!sha(value.sourceRevision)||value.sourceRevision!==revision)
  throw new Error("Invalid or stale ODD partition unit basis");
 const parent=value.partitionOrigin as ParentRequest;
 const {instruction:original,...raw}=parent;
 if(Object.hasOwn(raw,"repositoryIdentity"))throw new Error("ODD partition cannot select another repository");
 const facts=deriveOddFacts({...raw,repositoryIdentity:repository} as unknown as OddRoutingRequest);
 const unit=facts.taskUnits.find(item=>item.id===value.unitId);
 if(!unit)throw new Error("ODD partition unit does not exist");
 const child=deriveOddPartitionUnitFacts(facts,unit.id);
 const instruction=instructionFor(parent,unit.objective);
 if(value.taskIdentity!==child.taskIdentity||value.instruction!==instruction)
  throw new Error("ODD partition unit identity or instruction changed");
 return {facts:child,instruction,unit,parentFacts:facts};
}
function unitPlan(facts:OddDerivedFacts,instruction:string,basis:string,candidate:Candidate,profiles?:ProfileLayer){
 const decision=planOddRoute(facts);
 const plan=buildOrchestrationPlan({selectionProfile:"organic",taskId:facts.taskIdentity,repository:facts.repositoryIdentity,
  prompt:instruction,candidate,writeSurfaces:facts.writes.map(write=>write.path),...(profiles?{runtimeProfiles:profiles}:{})},decision);
 const graph=materializeExecutablePlan(plan,instruction,basis);
 if(graph.tasks.length!==1||graph.tasks[0]?.role!=="worker"||!graph.tasks[0].writerAuthorizationBasis)
  throw new Error("ODD partition must produce exactly one scoped Writer per unit");
 return {decision,plan,graph};
}
/** Materializa el DAG en una sola transacción del almacén Todo existente.
 * Las raíces son preparables, pero solo el supervisor de hijos puede lanzarlas.
 * Una sucesora conserva su dependencia y requiere integrar y volver a planificar. */
export function materializeOddPartitionPlan(parent:OddDerivedFacts,request:ParentRequest,candidate:Candidate,profiles?:ProfileLayer):ExecutablePlan|undefined{
 if(!canMaterializeOddPartition(parent))return undefined;
 if(candidate.repository!==parent.repositoryIdentity||!sha(candidate.revision))throw new Error("ODD partition candidate mismatch");
 const unitIds=new Map<string,string>(),tasks:PlannedTask[]=[];
 for(const unit of parent.taskUnits){
  const child=deriveOddPartitionUnitFacts(parent,unit.id);
  let instruction:string;
  try{instruction=instructionFor(request,unit.objective);}catch{return undefined;}
  const basis=JSON.stringify({instruction,taskIdentity:child.taskIdentity,partitionOrigin:request,unitId:unit.id,sourceRevision:candidate.revision});
  if(basis.length>16384)return undefined;
  const task=unitPlan(child,instruction,basis,candidate,profiles).graph.tasks[0]!;
  unitIds.set(unit.id,task.id);
  tasks.push(task);
 }
 const mapped=tasks.map((task,index)=>{
  const unit=parent.taskUnits[index]!;
  const dependencies=unit.dependsOn.map(id=>unitIds.get(id)!);
  return Object.freeze({...task,title:"Writer · "+unit.objective,dependsOn:Object.freeze(dependencies),status:dependencies.length?"waiting" as const:"ready" as const});
 });
 const byId=new Map(mapped.map(task=>[task.id,task])),seen=new Set<string>(),order:string[]=[];
 const visit=(id:string)=>{if(seen.has(id))return;for(const dep of byId.get(id)!.dependsOn)visit(dep);seen.add(id);order.push(id);};
 for(const task of mapped)visit(task.id);
 return Object.freeze({taskId:parent.taskIdentity,repository:parent.repositoryIdentity,route:"orchestrate",tasks:Object.freeze(mapped),
  topologicalOrder:Object.freeze(order),execution:"not_started",authorization:"required_before_dispatch"});
}
/** Reutiliza el planificador en el hijo ya asociado; no se prepara una
 * sucesora sobre el SHA original ni se copia autorización del padre. */
export function materializePartitionRoot(value:unknown,repository:string,candidate:Candidate,profiles?:ProfileLayer){
 if(candidate.repository!==repository)throw new Error("ODD partition child candidate mismatch");
 const parsed=parsePartitionUnitBasis(value,repository,candidate.revision);
 if(parsed.unit.dependsOn.length)throw new Error("ODD dependent unit requires integrated predecessors and fresh planning");
 const basis=JSON.stringify(value);
 if(basis.length>16384)throw new Error("ODD partition unit basis exceeds the Todo storage limit");
 return unitPlan(parsed.facts,parsed.instruction,basis,candidate,profiles);
}
