/** T08: observación segura tras respuesta perdida de un guardado ODD Fix.
 * No guarda, completa, reintenta ni despacha tareas, y nunca concede Writer. */
import {sameWorkspaceIdentityPath} from "../runtime/workspace-store.js";
import type {ScopedOddTodo} from "./odd-agent-review-flow.js";
import type {JudgmentFixOddDraft} from "./judgment-fix-odd-draft.js";

export interface FixOddRecovery{
 readonly status:"not-observed"|"worker-observed"|"archived-worker-observed"|"inconsistent";
 readonly sourceProposalId:string;
 readonly workerTodoId:string|null;
 readonly workerState:string|null;
 readonly observedIn:"active"|"archive"|null;
 readonly reason:string;
 readonly actualModel:"unknown";
 readonly writerAuthority:false;
 readonly authorized:false;
 readonly autoRetry:false;
 readonly autoLaunch:false;
 readonly acceptance:"not-accepted";
}
export function inspectFixOddRecovery(input:{
 readonly draft:JudgmentFixOddDraft;
 readonly todos:readonly ScopedOddTodo[];
 readonly archivedTodos?:readonly ScopedOddTodo[];
 readonly identity:Readonly<{sessionId:string;projectId:string}>;
}):FixOddRecovery{
 const {draft,todos,archivedTodos=[],identity}=input??{};
 if(!draft||!identity||draft.sessionId!==identity.sessionId||
  !sameWorkspaceIdentityPath(draft.projectId,identity.projectId)||
  draft.writerAuthority!==false||draft.authorized!==false||
  draft.autoLaunch!==false||!Array.isArray(todos)||todos.length>2000||
  !Array.isArray(archivedTodos)||archivedTodos.length>2000)
  throw new Error("Fix Todo recovery requires the original read-only Pi session");
 const requestId="asen-plan:fix-"+draft.sourceProposalId.slice(0,24)+":worker";
 const matches=(row:ScopedOddTodo)=>row&&
  (row.requestId===requestId||row.plan?.fixSource?.proposalId===draft.sourceProposalId);
 const active=todos.filter(matches),archived=archivedTodos.filter(matches);
 const rows=[...active,...archived];
 const wrong=rows.some(row=>!row||!row.current||
  row.current.sessionId!==identity.sessionId||
  !sameWorkspaceIdentityPath(row.current.projectId,identity.projectId)||
  row.plan?.role!=="worker"||
  row.requestId!==requestId||
  row.plan.fixSource?.proposalId!==draft.sourceProposalId||
  row.plan.fixSource.treeIdentity!==draft.sourceCandidateTree||
  JSON.stringify(row.plan.writeSurfaces)!==JSON.stringify(draft.writeSurfaces));
 const invalidArchive=archived.some(row=>!["done","cancelled"].includes(row.current?.state??""));
 const consistent=rows.length===1&&!wrong&&!invalidArchive;
 const row=consistent?rows[0]!:null;
 const observedIn=consistent?(active.length===1?"active" as const:"archive" as const):null;
 return Object.freeze({
  status:rows.length===0?"not-observed" as const:
   !consistent?"inconsistent" as const:
   observedIn==="archive"?"archived-worker-observed" as const:"worker-observed" as const,
  sourceProposalId:draft.sourceProposalId,
  workerTodoId:row?.taskId??null,
  workerState:row?.current.state??null,
  observedIn,
  reason:rows.length===0?
   "No active or archived Fix Worker was observed. An interrupted save or earlier unavailable archive may exist; inspect the Todo journal before retrying.":
   !consistent?
   "Ambiguous or forged Fix Worker provenance; inspect the Todo journal and do not retry automatically.":
   observedIn==="archive"?"A matching archived Fix Worker was observed; archived does not mean reviewed, authorized or repaired.":"An exact active Fix Worker exists; its current state does not imply completed repair or permission to write.",
  actualModel:"unknown" as const,
  writerAuthority:false as const,authorized:false as const,
  autoRetry:false as const,autoLaunch:false as const,
  acceptance:"not-accepted" as const
 });
}
