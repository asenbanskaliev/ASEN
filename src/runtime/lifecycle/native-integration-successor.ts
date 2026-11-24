import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {isolatedGitEnvironment} from "../agents/git-isolated-environment.js";
import type {NativeIntegrationCandidate} from "../agents/parallel-native-integration.js";
import {isAcceptedNativeIntegration,type AcceptedNativeIntegration} from "./native-integration-review.js";
import {parsePartitionUnitBasis} from "./odd-unit-plan.js";
import {controlledInstructionPlanCommand} from "./route-command.js";
import type {ExecutablePlan} from "../../orchestration/executable-plan.js";
import type {ProfileLayer} from "./profiles.js";
import type {SessionTodoStore,TodoContext,TodoPlanDraft} from "./todo-store.js";

export async function persistNativePartitionSuccessor(input:{
 candidate:NativeIntegrationCandidate;accepted:AcceptedNativeIntegration;identity:TodoContext;
 todos:SessionTodoStore;profiles:ProfileLayer;validate:()=>Promise<void>;
 verify:()=>Promise<void>;signal?:AbortSignal;
}){
 const {candidate,accepted,identity,todos}=input;
 if(!isAcceptedNativeIntegration(accepted,candidate,identity.sessionId)||identity.projectId!==candidate.repository)
  throw new Error("La sucesora requiere la integración auténtica de su lote.");
 const assertCurrent=async()=>{
  await input.validate();await input.verify();
  const git=(...args:string[])=>execFileSync("git",["-C",identity.projectId,...args],{encoding:"utf8",env:isolatedGitEnvironment(),timeout:5000,windowsHide:true});
  if(git("rev-parse","HEAD").trim()!==candidate.commit||git("rev-parse","HEAD^{tree}").trim()!==candidate.tree||
   git("status","--porcelain=v1","--untracked-files=all").length)
   throw new Error("La integración ya no coincide con el candidato aceptado.");
 };
 await assertCurrent();
 const rows=await todos.list(identity);
 const roots=candidate.sourceTodoIds.map(id=>rows.find(row=>row.taskId===id));
 if(roots.length!==2||roots.some(row=>!row||row.current.state!=="planned"||row.plan?.candidate?.revision!==candidate.baseCommit||
  !row.requestId||!row.plan.writerAuthorizationBasis||!row.description))throw new Error("Las raíces originales cambiaron.");
 const matches=rows.filter(row=>row.current.state==="planned"&&row.dependsOn?.length===2&&
  candidate.sourceTodoIds.every(id=>row.dependsOn!.includes(id)));
 if(matches.length!==1)return Object.freeze({status:"blocked" as const,reason:"Esta continuación admite una única sucesora que dependa exactamente de las dos raíces."});
 const old=matches[0]!,basis=old.plan?.writerAuthorizationBasis;
 if(!basis||old.plan?.candidate?.revision!==candidate.baseCommit)throw new Error("La sucesora original no conserva su base ODD.");
 const parsed=parsePartitionUnitBasis(JSON.parse(basis),identity.projectId,candidate.baseCommit);
 const predecessorUnits=roots.map(row=>parsePartitionUnitBasis(JSON.parse(row!.plan!.writerAuthorizationBasis!),identity.projectId,candidate.baseCommit));
 if(predecessorUnits.some(item=>item.parentFacts.taskIdentity!==parsed.parentFacts.taskIdentity||item.unit.dependsOn.length)||
  JSON.stringify(predecessorUnits.map(item=>item.unit.id).sort())!==JSON.stringify([...parsed.unit.dependsOn].sort()))
  throw new Error("Los predecesores no pertenecen a la misma partición ODD.");
 const freshId="continuation-"+createHash("sha256").update(JSON.stringify([old.requestId,candidate.commit])).digest("hex").slice(0,40);
 const facts=parsed.facts;
 const fresh={instruction:parsed.instruction,taskIdentity:freshId,intent:facts.intent,scope:facts.scope,writes:facts.writes,
  riskOperations:facts.riskOperations,namedRisks:facts.namedRisks,session:{...facts.session,continuation:true},
  testing:facts.testing,review:{kind:"dual_explicit",estimatedMinutes:15},unresolvedDecisions:facts.unresolvedDecisions};
 const output=JSON.parse(controlledInstructionPlanCommand(JSON.stringify(fresh),identity.projectId,{
  id:"asen-"+candidate.commit.slice(0,12),repository:identity.projectId,revision:candidate.commit,
  createdAt:new Date(execFileSync("git",["-C",identity.projectId,"show","-s","--format=%cI",candidate.commit],{encoding:"utf8",env:isolatedGitEnvironment(),timeout:5000}).trim()).toISOString()
 },input.profiles)) as {executablePlan:ExecutablePlan};
 const graph=output.executablePlan,workers=graph.tasks.filter(task=>task.role==="worker");
 if(workers.length!==1||!workers[0]?.writerAuthorizationBasis||!workers[0].candidate||
  JSON.stringify(workers[0].writeSurfaces)!==JSON.stringify(facts.writes.map(write=>write.path)))
  throw new Error("No existe un nuevo Writer exacto para la sucesora.");
 const worker=workers[0],replacementRequestId="asen-plan:"+worker.id;
 const rootRows=roots.map(row=>row!);
 const drafts:TodoPlanDraft[]=rootRows.map(row=>({title:row.title,requestId:row.requestId!,dependsOn:[],description:row.description!,plan:row.plan!}));
 for(const task of graph.tasks){
  drafts.push({title:task.title,requestId:"asen-plan:"+task.id,
   dependsOn:task.role==="worker"?rootRows.map(row=>row.requestId!):task.dependsOn.map(id=>"asen-plan:"+id),
   description:task.instruction,plan:{role:task.role,skillPaths:[...task.skillPaths],priority:task.priority,
    ...(task.skillSelection?{skillSelection:task.skillSelection}:{}),...(task.model?{model:task.model}:{}),
    ...(task.thinking?{thinking:task.thinking}:{}),...(task.candidate?{candidate:task.candidate}:{}),
    ...(task.role==="reviewer"||task.role==="verifier"?{candidateRevision:candidate.commit}:{}),
    ...(task.writeSurfaces?{writeSurfaces:[...task.writeSurfaces]}:{}),
    ...(task.writerAuthorizationBasis?{writerAuthorizationBasis:task.writerAuthorizationBasis}:{})}});
 }
 await assertCurrent();
 const saved=await todos.addPlan(drafts,identity,input.signal);
 await todos.acceptIntegratedPartition({context:identity,roots:rootRows,superseded:old,replacementRequestId,commit:candidate.commit,
  verify:assertCurrent,...(input.signal?{signal:input.signal}:{})});
 const next=saved.find(row=>row.requestId===replacementRequestId);
 if(!next)throw new Error("La sucesora guardada no está disponible.");
 return Object.freeze({status:"successor-ready" as const,todoId:next.taskId,commit:candidate.commit,writerAuthority:false as const});
}
