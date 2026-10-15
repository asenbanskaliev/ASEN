import {randomUUID} from "node:crypto";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";

export const ASEN_PLAN_REQUEST_TOOL="asen_plan_request";
const planKeys=["instruction","intent","scope","writes","riskOperations","session","testing","review","unresolvedDecisions"] as const;
const intent={type:"string",enum:["implementation","analysis","incident","verification","defect"]};
const scope={oneOf:[
 {type:"object",additionalProperties:false,required:["kind","expectedPaths"],properties:{kind:{type:"string",const:"known"},expectedPaths:{type:"array",items:{type:"string",minLength:1,maxLength:4096},maxItems:256}}},
 {type:"object",additionalProperties:false,required:["kind","reason"],properties:{kind:{type:"string",const:"unknown"},reason:{type:"string",minLength:1,maxLength:2048}}}
]};
const writes={type:"array",maxItems:256,items:{type:"object",additionalProperties:false,required:["path","changeKind"],properties:{path:{type:"string",minLength:1,maxLength:4096},changeKind:{type:"string",enum:["behavior","schema","security","configuration","migration","documentation","format","generated"]}}}};
const riskOperations={type:"array",maxItems:32,items:{type:"string",enum:["destructive_git","external_write","credential_or_auth","security_boundary"]}};
const session={type:"object",additionalProperties:false,required:["estimatedMinutes","continuation"],properties:{estimatedMinutes:{type:"integer",minimum:0,maximum:100000},continuation:{type:"boolean"}}};
const testing={oneOf:[
 {type:"object",additionalProperties:false,required:["kind"],properties:{kind:{type:"string",const:"required"}}},
 {type:"object",additionalProperties:false,required:["kind","reason"],properties:{kind:{type:"string",const:"n_a"},reason:{type:"string",minLength:1,maxLength:2048}}}
]};
const review={type:"object",additionalProperties:false,required:["kind","estimatedMinutes"],properties:{kind:{type:"string",enum:["none","ordinary","dual_explicit"]},estimatedMinutes:{type:"integer",minimum:0,maximum:100000}}};
const unresolvedDecisions={type:"array",maxItems:64,items:{type:"string",minLength:1,maxLength:2048}};
const text=(value:unknown):string=>typeof value==="string"?value:"";

function assertExactRequest(value:unknown):asserts value is Record<(typeof planKeys)[number],unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==planKeys.length||planKeys.some(key=>!Object.hasOwn(value,key)))throw new Error("ASEN plan request is incomplete; inspect the project and resolve material uncertainty before planning.");
}

function userSummary(value:unknown):string{
 if(!value||typeof value!=="object"||Array.isArray(value))return "ASEN could not prepare a readable plan.";
 const plan=value as {status?:unknown;route?:unknown;risk?:unknown;verification?:unknown;requiredAgentRoles?:unknown;executablePlan?:{tasks?:unknown};persistence?:{status?:unknown};execution?:{started?:unknown;authorized?:unknown}};
 if(plan.status==="needs-verified-facts")return "ASEN needs more information before it can prepare a safe plan. I will ask only about decisions that cannot be inferred from the request or project.";
 if((value as {inlineContinuation?:unknown}).inlineContinuation===true)return "La petición es acotada: continúa en esta misma conversación de Pi. No guardes una tarea Todo, no pidas al usuario ejecutar comandos ni detalles internos de planificación. No se lanzó ningún agente.";
 const tasks=Array.isArray(plan.executablePlan?.tasks)?plan.executablePlan!.tasks as Array<{role?:unknown;title?:unknown;status?:unknown;dependsOn?:unknown;writeSurfaces?:unknown}>:[];
 const routeLabel:Record<string,string>={direct:"trabajo acotado en la sesión actual",plan:"aclaración pendiente",orchestrate:"trabajo coordinado",incident:"atención de incidencia",verify:"verificación independiente"};
 const riskLabel:Record<string,string>={low:"riesgo bajo",medium:"riesgo medio",high:"riesgo alto",unknown:"riesgo por determinar"};
 const roleLabel:Record<string,string>={primary:"Trabajo en la sesión principal",explorer:"Exploración del proyecto",worker:"Aplicación del cambio",reviewer:"Revisión del cambio",verifier:"Verificación independiente",clarifier:"Aclaración pendiente"};
 const lines=[`ASEN preparó un plan de ${routeLabel[String(plan.route)]??"trabajo acotado"}${plan.risk?` (${riskLabel[String(plan.risk)]??"riesgo por determinar"})`:""}.`,...tasks.map((task,index)=>{
  const role=typeof task.role==="string"?task.role:"task",title=roleLabel[role]??(typeof task.title==="string"?task.title:"Tarea"),surfaces=Array.isArray(task.writeSurfaces)?task.writeSurfaces.filter((item):item is string=>typeof item==="string"):[];
  return `${index+1}. ${title}${surfaces.length?` — archivos propuestos: ${surfaces.join(", ")}`:""}`;
 })];
 lines.push(plan.persistence?.status==="saved"?"El plan quedó guardado para esta sesión.":"No se pudo guardar el plan en las tareas de esta sesión.");
 lines.push(plan.execution?.started===false?"No se ha iniciado ningún trabajo ni se han concedido permisos; el plan espera una aclaración o una autorización.":plan.execution?.authorized===true?"El escritor se inició con autorización explícita limitada a los archivos indicados; la revisión y verificación continúan automáticamente.":"Se inició una tarea de solo lectura. Las escrituras siguen necesitando autorización explícita.");
 return lines.join("\n");
}

/** Registers the model-facing intake bridge. ODD facts are generated inside Pi, not authored by the user. */
export function registerAsenPlanRequestTool(
 pi:{registerTool?:(tool:ToolDefinition<any>)=>void},
 prepare:(argumentsJson:string,context:any)=>Promise<string>,
 taskIdentity:()=>string=()=>`task-${randomUUID()}`,
):void{
 pi.registerTool?.({
  name:ASEN_PLAN_REQUEST_TOOL,label:"Prepare ASEN task plan",
  description:"Turn the user's ordinary-language project request into a validated ASEN plan. Inspect the project first; derive these ODD facts yourself, never ask the user to write JSON or supply internal IDs. ASEN persists the plan and may automatically start dependency-ready read-only work. It never grants write permission; every writer needs exact Pi approval, and the plan completes only after a passing independent verifier.",
  executionMode:"sequential",
  parameters:{type:"object",additionalProperties:false,required:[...planKeys],properties:{instruction:{type:"string",minLength:1,maxLength:8192},intent,scope,writes,riskOperations,session,testing,review,unresolvedDecisions}},
  execute:async(_callId,params,_signal,_update,context)=>{
   assertExactRequest(params);
   const id=taskIdentity();if(!id||id.trim()!==id)throw new Error("ASEN could not create an internal task identity.");
   const argumentsJson=JSON.stringify({...params,taskIdentity:id});
   const raw=await prepare(argumentsJson,context);
   let parsed:unknown;try{parsed=JSON.parse(raw);}catch{throw new Error("ASEN returned an invalid planning result.");}
   return {content:[{type:"text",text:userSummary(parsed)}],details:parsed};
  },
 });
}
