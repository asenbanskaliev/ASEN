/** Proceso de prueba independiente: sin agentes, modelos ni autorizaciones
 * heredadas. Reabre los diarios de un repositorio sintético de la suite. */
import {join} from "node:path";
import assert from "node:assert/strict";
import {SessionTodoStore,type TodoContext} from "../../src/runtime/lifecycle/todo-store.js";
import {ParallelTodoWorktreeJournal} from "../../src/runtime/agents/parallel-todo-journal.js";
import {ParallelChildSessionJournal} from "../../src/runtime/agents/parallel-todo-session-links.js";
import {ParallelWorkerObservationJournal} from "../../src/runtime/agents/parallel-worker-observation-journal.js";
import {buildNativeIntegrationCandidate} from "../../src/runtime/agents/parallel-native-integration.js";
import {ReceiptVerifierService} from "../../src/evidence/receipt-verifier.js";
import {reviewNativePartitionWithTests,acceptNativeIntegration,verifyNativeIntegrationAcceptance} from "../../src/runtime/lifecycle/native-integration-review.js";
import {persistNativePartitionSuccessor,inspectCompletedNativePartition} from "../../src/runtime/lifecycle/native-integration-successor.js";

const [phase,dir,serialized,batchId]=process.argv.slice(2);
if(!dir||!serialized||!batchId||!["resume","inspect"].includes(phase??""))throw Error("Argumentos de prueba inválidos");
const identity=JSON.parse(serialized) as TodoContext;
const todos=await SessionTodoStore.openProjectScoped(join(dir,"todos"),join(dir,"todos.json"));
const sourceJournal=new ParallelTodoWorktreeJournal(join(dir,"parallel-todo-worktrees.json"));
const sessionJournal=new ParallelChildSessionJournal(join(dir,"parallel-worktree-sessions.json"),sourceJournal);
const observations=new ParallelWorkerObservationJournal(join(dir,"parallel-worker-observations.json"));
const receipts=new ReceiptVerifierService(join(dir,"receipts"));
const candidate=await buildNativeIntegrationCandidate({identity,batchId,sourceJournal,sessionJournal,observations});
const validate=async()=>{};
let authorizations=0;
const confirm=async()=>{authorizations++;return true;};
const completed=await inspectCompletedNativePartition({candidate,identity,todos,receipts,validate});
if(phase==="inspect"){
 assert.ok(completed);assert.equal(authorizations,0);
 process.stdout.write(JSON.stringify({...completed,authorizations})+"\n");
}else{
 assert.equal(completed,undefined);
 const result=await reviewNativePartitionWithTests({candidate,sessionId:identity.sessionId,todos,receipts,validate,confirm});
 assert.equal(result.status,"joint-tests-reviewed");
 if(!("report" in result)||!result.report)throw Error("No hay revisión nueva");
 const proof={candidate,sessionId:identity.sessionId,report:result.report,receipts};
 const accepted=await acceptNativeIntegration({...proof,validate,confirm});
 assert.ok(accepted);
 const successor=await persistNativePartitionSuccessor({candidate,accepted,identity,todos,
  profiles:{global:{schema:"asen.runtime-profiles/v1",active:"cambiado",profiles:[{name:"cambiado",mode:"full-delegation",routes:{worker:{model:"nvidia/otro-modelo",thinking:"minimal"}}}]}},
  validate,verify:async()=>{await verifyNativeIntegrationAcceptance(proof);}});
 assert.equal(authorizations,2);
 process.stdout.write(JSON.stringify({...successor,authorizations})+"\n");
}
