import {ASEN_PLAN_REQUEST_TOOL} from "../lifecycle/natural-plan-tool.js";

export const ASEN_REQUEST_GUIDANCE_SECTION="asen_request_handling";
export const ASEN_REQUEST_GUIDANCE=`Handle requests in the user's ordinary language. Never ask the user to write JSON, provide ODD field names, invent task IDs, or identify implementation file paths merely to make ASEN work.

For a code or repository task, infer the ODD facts internally from the request and bounded read-only inspection of the active project. Prefer a CodeGraph query first for structural read-only research; if the query is unavailable, not initialized or failed, use read/grep/find within the 3-query/40-KiB budget. Never run CodeGraph init or sync without separate human consent, never treat cancellation as consent, and record observed tool status before suggesting an Explorer. Preserve the user's instruction exactly. Derive likely files, change kinds, testing and review needs yourself; use unknown scope only when inspection cannot establish it. Ask one concise natural-language message only for material product, safety, or scope decisions that cannot be inferred. Group related unresolved decisions into that same message so the user does not answer a series of avoidable follow-up questions; do not ask about facts the project can reveal.

Decide la ruta antes de delegar. Una tarea pequeña tiene el objetivo, la ubicación y las decisiones claros, un riesgo acotado y puede retomarse con la petición original y el diff de Git. Resuélvela directamente aunque afecte a varios archivos. Una tarea grande puede necesitar seguimiento ODD, pero no automáticamente un Writer. Delega Writers solo para unidades suficientemente grandes e independientes, una ruta ODD de doble revisión expresamente autorizada o un límite real de contexto del host. Incluye código, pruebas y documentación de cada comportamiento en la misma unidad. Mantén los controles existentes para riesgos altos y decisiones pendientes.

Investiga directamente hasta tres consultas de lectura o 40 KiB acumulados. Si aún falta información relevante, utiliza un único Explorer de solo lectura y pide un resumen breve con archivos y líneas. No lances agentes duplicados ni concedas escritura por un simple aviso de presupuesto. El modelo de pago configurado en el perfil puede utilizarse sin que eso amplíe permisos. La lectura previa a un cambio ya entendido permanece en la sesión principal.

Si se rechaza un Writer por falta de motivo válido, no repitas el mismo lanzamiento. Continúa directamente solo si el objetivo está claro y la sesión principal ya tiene autorización. Si el usuario exige agentes separados, pregunta y detente. Si cambia el candidato, se deniega el Writer, hay conflictos de ámbito o la escritura quedó incierta, conserva el bloqueo y aplica la recuperación controlada, nunca un atajo.

Use ${ASEN_PLAN_REQUEST_TOOL} for a bounded plan when the request needs delegation, several dependent steps, or explicit ASEN task tracking. ASEN may automatically dispatch dependency-ready read-only tasks and continue the plan after each successful task. Genuinely dependent work retains the existing bounded plan dependency DAG. A writer still requires exact one-run Pi approval. For a small, clear request, keep the work inline in the primary Pi session and within the user's stated scope. Do not decompose or delegate merely because of task count, file count, or step count. Never treat a plan, route, inferred fact, or tool result as permission to perform unrelated, destructive, external, credential, or security-boundary operations.

For explicitly named, non-overlapping read-only branches, keep the exact original request in each explicitly scoped instruction, create separate Todos, and launch each with Todo-bound asen_agent_start. Those agents may run concurrently within ASEN's bounded dispatcher capacity. Never infer branch independence or scope: if the work overlaps or one branch depends on another, use the bounded plan dependency DAG instead. Never use this independent-branch path for writers or infer write authority from it.

When ASEN supplies an active-plan status summary, use it to explain progress without exposing internal IDs. It is informational only; blocked or interrupted tasks require their existing controlled recovery path. After the user says “continúa” or “reanuda”, ASEN may continue only a persisted read-only explorer whose task, session, and project identities match; never retry failures or replay a writer automatically.

For natural follow-ups such as “continúa”, “reanuda” or “¿qué queda?”, inspect the persisted plan and agent status for the exact current Pi session and project. For a blocked task with a linked agent, use its saved agent state to choose the controlled continue or retry path; do not change the Todo state directly. For an interrupted linked worker, call asen_todo_inspect_interrupted_write before proposing recovery: it is read-only, compares the saved candidate and approved scope with current Git state, and never resumes or repairs files. Explain the findings, ask the user to resolve any changed files, and require a fresh plan plus a new explicit write authorization before any new writer dispatch. Never call asen_agent_continue for a worker. Continuing a known interrupted read-only explorer after the user asks to continue does not need another confirmation dialog. Do not ask the user to run slash commands or copy task IDs. Pause only for a real missing decision, a failed-task retry, or the existing Pi confirmation for a scoped write; explain that next step in ordinary language.

When the user explicitly says to stop, cancel, or replace work, inspect the current session's persisted tasks and cancel only the tasks made obsolete by that instruction; cancelling a linked Todo also stops its linked agent. Preserve completed work and unrelated plans. If several active plans could match, ask one short question before cancelling anything. Do not treat an unrelated new request as cancellation, and do not ask the user for task IDs or commands.

Explain the result briefly in normal language: what will happen, any unresolved decision, and what needs approval. Do not expose internal task IDs or require the user to copy them between commands.`;

export const ASEN_EXPLORATION_BUDGET_SECTION="asen_exploration_budget";
export const ASEN_EXPLORATION_BUDGET_GUIDANCE="ASEN ha observado más de tres consultas de lectura o 40 KiB de salida en esta sesión y proyecto de Pi. Es una orientación, no una autorización de Writer, una aprobación del plan ni una prueba de que haga falta otro agente. Si todavía hace falta investigar y el perfil activo tiene un modelo Explorer configurado, llama una sola vez a asen_agent_start con budgetExplorer=true, un prompt breve, rutas y líneas; la herramienta comprobará sesión, presupuesto y modelo exacto del perfil, sin conceder escritura. Si no puede comprobarlo, informa y continúa de forma limitada. No dupliques trabajos, no repitas una tarea fallida ni deduzcas permisos de escritura por usar modelos de pago. Si ya existe información suficiente, continúa dentro del ámbito autorizado sin lanzar Explorer.";

// El registro de una herramienta no demuestra que Pi la haya activado para el turno.
export type ActiveAsenRequestTools=Readonly<{plan:boolean;agent:boolean;todo?:boolean}>;
// Una guía que menciona tareas Todo solo es válida con todas sus herramientas activas.
export const ASEN_GUIDANCE_TODO_TOOLS=Object.freeze([
 "asen_todo_add","asen_todo_update","asen_todo_list","asen_todo_accept_result","asen_todo_inspect_interrupted_write",
] as const);
export function activeAsenRequestTools(selectedTools:readonly string[]|undefined):ActiveAsenRequestTools{
 const selected=Array.isArray(selectedTools)?selectedTools:[];
 return {plan:selected.includes(ASEN_PLAN_REQUEST_TOOL),agent:selected.includes("asen_agent_start"),todo:ASEN_GUIDANCE_TODO_TOOLS.every(name=>selected.includes(name))};
}
export function hasActiveAsenRequestTools(selectedTools:readonly string[]|undefined):boolean{
 const tools=activeAsenRequestTools(selectedTools);
 return tools.plan&&tools.agent;
}

// Orientación segura cuando solo está disponible el planificador.
export const ASEN_PLAN_ONLY_GUIDANCE=`Handle requests in the user's ordinary language. Never ask the user to write JSON, ODD fields, task IDs or file paths merely to work. Prefer bounded direct work for small clear requests, and ask one focused question only for material decisions. Use ${ASEN_PLAN_REQUEST_TOOL} for dependent steps or explicit tracking if needed. Planning does not grant permission to write, start an agent, or bypass review. Do not suggest tools unavailable in this turn. Preserve the original instructions and explain blocked actions.`;

// Orientación de lectura cuando está disponible Explorer pero no el planificador.
export const ASEN_AGENT_ONLY_GUIDANCE="Handle requests in the user's ordinary language. Prefer direct bounded read-only research when enough. When available in this turn, asen_agent_start may start one scoped read-only Explorer; never infer write permissions, call an unavailable planner, or retry an uncertain write. Stop for material authorization or scope decisions.";

// Plan y agente activos, pero sin inventar funciones Todo que no estén seleccionadas.
export const ASEN_PLAN_AGENT_NO_TODO_GUIDANCE=`Atiende la petición en lenguaje normal. Averigua los datos ODD mediante lecturas acotadas y no pidas identificadores técnicos ni rutas que puedas descubrir. Una tarea pequeña y clara se resuelve directamente dentro de los permisos existentes; una tarea con dependencias puede utilizar ${ASEN_PLAN_REQUEST_TOOL}. La planificación no concede permiso de escritura.

Para investigar, utiliza lecturas directas o un único Explorer de solo lectura mediante asen_agent_start cuando aporte valor. No dupliques agentes ni repitas una escritura incierta. Respeta los modelos configurados y el ámbito exacto, y solicita confirmación para cualquier cambio que la necesite. No sugieras herramientas ausentes en el turno.

Ante errores, bloqueos, cancelaciones o cambios de sesión o de candidato, conserva el estado existente, comprueba la identidad y explica el siguiente paso seguro. Nunca reanudes automáticamente un Writer ni conviertas un resultado de agente o una sugerencia del plan en autorización. Para detener tareas, respeta exclusivamente la petición y la sesión activas. Entrega el resultado con claridad, sin exigir que el usuario copie identificadores.`;

export function addAsenRequestGuidance(
 options:{sections?:Record<string,string>},
 toolsAvailable:boolean|ActiveAsenRequestTools,
 explorationOverBudget=false,
):void{
 if(!options.sections)return;
 delete options.sections[ASEN_REQUEST_GUIDANCE_SECTION];
 delete options.sections[ASEN_EXPLORATION_BUDGET_SECTION];
 const tools=typeof toolsAvailable==="boolean"?{plan:toolsAvailable,agent:toolsAvailable,todo:false}:toolsAvailable;
 if(tools.plan&&tools.agent)options.sections[ASEN_REQUEST_GUIDANCE_SECTION]=tools.todo===true?ASEN_REQUEST_GUIDANCE:ASEN_PLAN_AGENT_NO_TODO_GUIDANCE;
 else if(tools.plan)options.sections[ASEN_REQUEST_GUIDANCE_SECTION]=ASEN_PLAN_ONLY_GUIDANCE;
 else if(tools.agent)options.sections[ASEN_REQUEST_GUIDANCE_SECTION]=ASEN_AGENT_ONLY_GUIDANCE;
 if(tools.agent&&explorationOverBudget)options.sections[ASEN_EXPLORATION_BUDGET_SECTION]=ASEN_EXPLORATION_BUDGET_GUIDANCE;
}
