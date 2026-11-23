import type {TodoItem} from "./todo-store.js";
import {selectSkills} from "../../skills/registry.js";

/** Estado mínimo recuperado del diario de tareas de la sesión y proyecto activos. */
export type BoundRiskPlanTask=Pick<TodoItem,"taskId"|"requestId"|"dependsOn"|"plan"|"description">&
 Readonly<{current:Readonly<{state:string}>}>;

export interface RiskVerifierBinding{
 readonly taskIdentity:string;
 readonly writerTodoId:string;
 readonly candidateRevision:string;
 readonly reviewerCount:number;
}

// El límite debe coincidir con el tamaño aceptado por el despacho Pi.
// No se permite iniciar un Writer si los lectores posteriores no pueden ejecutarse.
const MAX_VISIBLE_PLAN_INSTRUCTION=4096;
function instructionReady(value:string|undefined):boolean{
 return typeof value==="string"&&value.trim().length>0&&value.length<=MAX_VISIBLE_PLAN_INSTRUCTION;
}
// El registro de habilidades puede cambiar desde la planificación. Comprobar
// las rutas completas, en el mismo orden, antes de permitir escrituras.
function exactSkillPaths(plan:BoundRiskPlanTask["plan"]):boolean{
 if(!plan?.skillSelection||!Array.isArray(plan.skillPaths))return false;
 try{
  const expected=selectSkills(plan.skillSelection).map(skill=>skill.path);
  return expected.length===plan.skillPaths.length&&
   expected.every((path,index)=>path===plan.skillPaths[index]);
 }catch{return false;}
}

/** El aviso de riesgo ODD no basta: el plan guardado debe contener el Verifier.
 * No inicia modelos, concede autorizaciones ni declara resultados aceptados.
 * Si alguien borra o altera una tarea del diario, la escritura NO puede arrancar.
 */
export function inspectRiskVerifierBinding(
 tasks:readonly BoundRiskPlanTask[],bound:RiskVerifierBinding
):string|undefined{
 if(!bound.taskIdentity||!bound.writerTodoId||
  !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/iu.test(bound.candidateRevision)||
  !Number.isInteger(bound.reviewerCount)||bound.reviewerCount<0||bound.reviewerCount>2)
  return "Identidad del plan independiente inválida: no se inicia Writer";

 const byRequest=(suffix:string)=>tasks.filter(t=>
  t.requestId===`asen-plan:${bound.taskIdentity}:${suffix}`);
 const writers=byRequest("worker");
 if(writers.length!==1||writers[0]!.taskId!==bound.writerTodoId||
  writers[0]!.plan?.role!=="worker"||
  !["planned","running"].includes(writers[0]!.current.state)||
  writers[0]!.plan?.candidate?.revision!==bound.candidateRevision)
  return "La unidad Writer del plan guardado no coincide con la candidatura original";

 const reviewers:BoundRiskPlanTask[]=[];
 for(let i=0;i<bound.reviewerCount;i++){
  const matches=byRequest(i===0?"reviewer":`reviewer:${i+1}`);
  if(matches.length!==1||matches[0]!.plan?.role!=="reviewer"||
    matches[0]!.plan?.skillSelection?.phase!=="adversarial-review"||
    matches[0]!.current.state!=="planned"||
    matches[0]!.plan?.candidateRevision!==bound.candidateRevision||
    !instructionReady(matches[0]!.description)||
    !exactSkillPaths(matches[0]!.plan)||
    JSON.stringify(matches[0]!.dependsOn??[])!==JSON.stringify([bound.writerTodoId]))
   return "La revisión independiente falta o cambió de candidato, rol o dependencia";
  reviewers.push(matches[0]!);
 }
 const verifiers=byRequest("verifier");
 const verifier=verifiers[0];
 if(verifiers.length!==1||!verifier||verifier.plan?.role!=="verifier"||
  verifier.plan?.skillSelection?.phase!=="verify"||
  verifier.plan?.candidateRevision!==bound.candidateRevision||
  verifier.current.state!=="planned"||
  !instructionReady(verifier.description)||
  !exactSkillPaths(verifier.plan))
  return "Falta el Verifier independiente obligatorio para el riesgo nombrado";
 const required=[bound.writerTodoId,...reviewers.map(r=>r.taskId)];
 if(new Set(required).size!==required.length||
  JSON.stringify(verifier.dependsOn??[])!==JSON.stringify(required))
  return "La verificación independiente no depende exactamente del Writer y sus revisores";
 return undefined;
}
