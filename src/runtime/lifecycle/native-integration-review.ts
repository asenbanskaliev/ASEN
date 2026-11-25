/** Dos jueces Pi auténticos sobre el árbol combinado, sin entregar código al
 * Writer ni confundir el informe de modelos con pruebas o aceptación. */
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,realpathSync,lstatSync,fstatSync,openSync,closeSync,readSync,writeFileSync,fsyncSync,constants} from "node:fs";
import {join} from "node:path";
import {isolatedGitEnvironment,checkoutEolSettings} from "../agents/git-isolated-environment.js";
import {readFrozenIntegrationReviewEvidence} from "../../review/workspace-review-session.js";
import {runJudgmentDay,isIssuedJudgmentDayReport,type JudgmentDayReport} from "../../review/judgment-day.js";
import {reviewModelIdentityKey,availableIndependentPiReviewers,type PiReviewRegistry,type PiReviewerModel} from "../../review/pi-model-reviewer.js";
import {proposeJudgmentFixHandoff} from "../../review/odd-agent-review-flow.js";
import type {JudgmentFixProposalJournal} from "../../review/judgment-fix-proposal-journal.js";
import type {RouteChoice} from "./profiles.js";
import type {ReviewReceiptReader} from "./review-acceptance.js";
import type {SessionTodoStore} from "./todo-store.js";
import {parsePartitionUnitBasis} from "./odd-unit-plan.js";
import {canMaterializeOddPartition} from "../../flow/odd-routing.js";
import {isIssuedNativeIntegrationCandidate,readNativeIntegrationDiff,type NativeIntegrationCandidate} from "../agents/parallel-native-integration.js";

const reportBindings=new WeakMap<object,string>();
const integrationKey=(candidate:NativeIntegrationCandidate,sessionId:string)=>JSON.stringify([candidate.batchId,candidate.repository,candidate.commit,candidate.tree,sessionId]);
export async function reviewNativeIntegratedCandidate(input:{
 candidate:NativeIntegrationCandidate;sessionId:string;registry:PiReviewRegistry;
 judgeA:RouteChoice|undefined;judgeB:RouteChoice|undefined;fixProfile?:RouteChoice;
 fixJournal:JudgmentFixProposalJournal;requirements:string;validate:()=>Promise<void>;
 confirm:(summary:string)=>Promise<boolean>;signal?:AbortSignal;
}){
 const {candidate,registry,sessionId}=input;
 const blocked=(reason:string)=>Object.freeze({status:"blocked" as const,reason,acceptance:"not-accepted" as const,autoMerge:false as const});
 if(!isIssuedNativeIntegrationCandidate(candidate)||!candidate.authorModelsObserved?.length)
  return blocked("No hay modelos autores observados por Pi para acreditar independencia de los jueces.");
 const authors=new Set(candidate.authorModelsObserved),key=(m:PiReviewerModel)=>m.provider+"/"+m.id;
 // Excluir también la representación abreviada del mismo modelo de Pi.
 const authorKeys=new Set([...authors].map(value=>{const slash=value.indexOf("/");return reviewModelIdentityKey({provider:value.slice(0,slash),id:value.slice(slash+1)});}));
 const isAuthor=(m:PiReviewerModel)=>!m||typeof m.provider!=="string"||typeof m.id!=="string"||authorKeys.has(reviewModelIdentityKey(m));
 const filtered:PiReviewRegistry={
  getAvailable:()=>registry.getAvailable().filter(model=>!isAuthor(model)),
  hasConfiguredAuth:model=>!isAuthor(model)&&registry.hasConfiguredAuth(model),
  streamSimple:(model,context,options)=>{
   if(isAuthor(model))throw new Error("A Writer model cannot judge its integrated result");
   return registry.streamSimple(model,context,options);
  }
 };
 const [provider,...parts]=candidate.authorModelsObserved[0]!.split("/");
 const author={provider:provider!,id:parts.join("/")};
 const available=availableIndependentPiReviewers(filtered,author);
 const a=available.find(model=>key(model)===input.judgeA?.model),b=available.find(model=>key(model)===input.judgeB?.model);
 if(!a||!b||reviewModelIdentityKey(a)===reviewModelIdentityKey(b)||input.judgeA?.thinking!==undefined||input.judgeB?.thinking!==undefined)
  return blocked("Configura dos modelos juez autenticados, distintos entre sí y de todos los Writers observados. Este transporte no aplica esfuerzo por llamada.");
 const validate=async()=>{
  if(input.signal?.aborted)throw new Error("Revisión cancelada");
  await input.validate();readNativeIntegrationDiff(candidate);
 };
 await validate();
 const evidence=readFrozenIntegrationReviewEvidence(candidate,sessionId,"pi-model:"+key(a),tmpdir());
 await validate();
 if(await input.confirm(["Candidato exacto: "+candidate.commit,"Árbol: "+candidate.tree,
  "Archivos: "+candidate.paths.join(", "),"Autores observados: "+[...authors].join(", "),
  "Juez A: "+key(a),"Juez B: "+key(b),"Dos llamadas de lectura; coste no verificado. No se escribe ni integra código."].join("\n"))!==true)
  return Object.freeze({status:"declined" as const,acceptance:"not-accepted" as const,autoMerge:false as const});
 await validate();
 const report=await runJudgmentDay({registry:filtered,author,judgeA:a,judgeB:b,evidence,
  requirements:input.requirements,...(input.signal?{signal:input.signal}:{}),validateBeforeJudge:validate});
 await validate();
 if(report.judges.some(judge=>judge.identity?.status!=="declared-match"))return blocked("No se ha comprobado la identidad declarada de ambos jueces; no autorizar corrección ni integración.");
 reportBindings.set(report,integrationKey(candidate,sessionId));
 const fix=proposeJudgmentFixHandoff({report,evidence,...(input.fixProfile?{fixProfile:input.fixProfile}:{})});
 let fixProposalId:string|undefined;
 if((fix.status==="fix-planning-required"||fix.status==="manual-triage-required")&&fix.paths.every(path=>candidate.paths.includes(path))){
  const saved=await input.fixJournal.record(fix);fixProposalId=saved.id;
 }
 await validate();
 return Object.freeze({status:report.status,candidateCommit:candidate.commit,candidateTree:candidate.tree,report,fix,
  ...(fixProposalId?{fixProposalId}:{}),acceptance:"not-accepted" as const,autoMerge:false as const});
}

/** La modalidad sin jueces no depende del tamaño del catálogo. Solo se admite
 * para una partición ODD genuina de riesgo bajo/medio, con pruebas obligatorias
 * y sin revisión expresa ni riesgos nombrados. No hay dictamen independiente. */
export type NativePartitionTestReport=Readonly<{
 status:"joint-tests-reviewed";sessionId:string;candidateRevision:string;candidateTreeIdentity:string;
 review:"human-readback-and-signed-tests";independentReview:false;modelCalls:0;
 acceptance:"not-accepted";autoMerge:false;deliveryAuthority:false;
}>;
export type NativeIntegrationReviewReport=JudgmentDayReport|NativePartitionTestReport;
const testReportBindings=new WeakMap<object,{key:string;fingerprint:string;receiptSignature:string;todos:Pick<SessionTodoStore,"list">}>();
export async function inspectPartitionPolicy(candidate:NativeIntegrationCandidate,sessionId:string,todos:Pick<SessionTodoStore,"list">){
 if(!isIssuedNativeIntegrationCandidate(candidate)||!sessionId||candidate.sourceBindings?.length!==2)
  throw Error("La revisión proporcional requiere las dos raíces originales acreditadas.");
 const rows=await todos.list({sessionId,projectId:candidate.repository});
 const bindings=candidate.sourceBindings;
 const roots=bindings.map(binding=>{
  const row=rows.find(item=>item.taskId===binding.taskId);
  if(!row||row.current.state!=="planned"||row.current.revision!==binding.taskRevision||
    row.current.sessionId!==sessionId||row.current.projectId!==candidate.repository||
    row.requestId!==binding.requestId||row.plan?.role!=="worker"||
    row.plan.candidate?.revision!==candidate.baseCommit||row.dependsOn?.length||
    !row.plan.writerAuthorizationBasis||
    JSON.stringify(row.plan.writeSurfaces)!==JSON.stringify(binding.writeSurfaces))
   throw Error("La raíz ODD original cambió; no reducir la revisión.");
  const basis=JSON.parse(row.plan.writerAuthorizationBasis);
  const parsed=parsePartitionUnitBasis(basis,candidate.repository,candidate.baseCommit);
  if(!canMaterializeOddPartition(parsed.parentFacts)||parsed.unit.dependsOn.length||
    parsed.facts.review.kind!=="none"||parsed.facts.testing.kind!=="required"||
    row.requestId!==`asen-plan:${parsed.facts.taskIdentity}:worker`||
    row.description!=="Perform only the authorized, scoped work for: "+parsed.instruction||
    JSON.stringify(parsed.facts.writes.map(write=>write.path))!==JSON.stringify(binding.writeSurfaces))
   throw Error("La política ODD no autoriza una integración solo con pruebas.");
  return {basis,parsed,row};
 });
 const first=roots[0]!,second=roots[1]!;
 if(first.parsed.unit.id===second.parsed.unit.id||
    JSON.stringify(first.basis.partitionOrigin)!==JSON.stringify(second.basis.partitionOrigin)||
    !candidate.paths.every(path=>bindings.some(binding=>binding.writeSurfaces.includes(path))))
  throw Error("Las raíces y el ámbito no pertenecen a la misma partición ODD.");
 const successor=rows.filter(row=>row.current.state==="planned"&&row.plan?.role==="worker"&&
  row.plan.candidate?.revision===candidate.baseCommit&&row.dependsOn?.length===2&&
  candidate.sourceTodoIds.every(id=>row.dependsOn!.includes(id)));
 if(successor.length!==1||!successor[0]?.plan?.writerAuthorizationBasis)
  throw Error("No se conserva la dependencia ODD original.");
 const next=JSON.parse(successor[0].plan.writerAuthorizationBasis);
 const parsedNext=parsePartitionUnitBasis(next,candidate.repository,candidate.baseCommit);
 if(JSON.stringify(next.partitionOrigin)!==JSON.stringify(first.basis.partitionOrigin)||
   JSON.stringify([...parsedNext.unit.dependsOn].sort())!==JSON.stringify(roots.map(root=>root.parsed.unit.id).sort())||
   successor[0].requestId!==`asen-plan:${parsedNext.facts.taskIdentity}:worker`||
   successor[0].description!=="Perform only the authorized, scoped work for: "+parsedNext.instruction||
   JSON.stringify(successor[0].plan.writeSurfaces)!==JSON.stringify(parsedNext.facts.writes.map(write=>write.path)))
  throw Error("La sucesora no coincide con el plan original.");
 return {fingerprint:JSON.stringify([...roots.map(root=>root.row),successor[0]]),risk:first.parsed.parentFacts.risk,
  requirements:roots.map(root=>root.row.description!).join("\n")};
}
export async function exactPassingReceipt(candidate:NativeIntegrationCandidate,receipts:ReviewReceiptReader){
 readNativeIntegrationDiff(candidate);
 const state=await receipts.readReceiptState(candidate.commit);
 if(state.status!=="valid"||state.receipt.verdict!=="PASSED"||state.receipt.treeSha!==candidate.tree||
  state.receipt.commitSha!==candidate.commit||!Number.isSafeInteger(state.receipt.testSuite.total)||
  state.receipt.testSuite.total<1||state.receipt.testSuite.passed!==state.receipt.testSuite.total||
  state.receipt.testSuite.failed!==0||!state.receipt.testSuite.runner?.trim())
  throw new Error("Authenticated passing test receipt of the exact integration candidate is required");
 return state.receipt;
}
export async function reviewNativePartitionWithTests(input:{
 candidate:NativeIntegrationCandidate;sessionId:string;todos:Pick<SessionTodoStore,"list">;receipts:ReviewReceiptReader;
 validate:()=>Promise<void>;confirm:(summary:string)=>Promise<boolean>;signal?:AbortSignal;
}){
 const {candidate,sessionId,todos,receipts}=input;
 const inspect=async()=>{
  if(input.signal?.aborted)throw Error("Revisión cancelada");
  await input.validate();
  const receipt=await exactPassingReceipt(candidate,receipts);
  const policy=await inspectPartitionPolicy(candidate,sessionId,todos);
  await input.validate();
  if(input.signal?.aborted)throw Error("Revisión cancelada");
  return {policy,receipt};
 };
 const initial=await inspect(),diff=readNativeIntegrationDiff(candidate);
 // No truncar el diff para conseguir un consentimiento aparente.
 if(diff.diff.length>24000||initial.policy.requirements.length>20000)
  throw Error("La revisión proporcional excede el límite de lectura; usar /asen-worktrees integration-review-dual <lote> si hay dos jueces independientes disponibles, o volver a planificar un ámbito menor.");
 if(await input.confirm(["Riesgo ODD: "+initial.policy.risk+"; sin revisión independiente requerida por el plan.",
  "Candidato: "+candidate.commit,"Árbol: "+candidate.tree,"Pruebas conjuntas firmadas: "+initial.receipt.testSuite.total,
  "Comando/ejecutor registrado: "+initial.receipt.testSuite.runner,
  "Comprueba requisitos, cambios y unión de unidades. Si detectas un riesgo nuevo o defecto, rechaza y vuelve a planificar.",
  "Instrucciones originales:",initial.policy.requirements,"Diferencias completas (texto escapado):",
  JSON.stringify(diff.diff).replace(/[\p{Cf}\u2028\u2029]/gu,ch=>"\\u"+ch.charCodeAt(0).toString(16).padStart(4,"0")),
  "No se ejecutan modelos ni se otorga permiso de escritura o integración."].join("\n"))!==true)
  return Object.freeze({status:"declined" as const,acceptance:"not-accepted" as const,autoMerge:false as const});
 const latest=await inspect();
 if(latest.policy.fingerprint!==initial.policy.fingerprint||latest.receipt.signature!==initial.receipt.signature)
  throw Error("El plan o recibo cambió durante la revisión; no se admite.");
 const report:NativePartitionTestReport=Object.freeze({status:"joint-tests-reviewed",sessionId,
  candidateRevision:candidate.tree,candidateTreeIdentity:candidate.tree,review:"human-readback-and-signed-tests",
  independentReview:false,modelCalls:0,acceptance:"not-accepted",autoMerge:false,deliveryAuthority:false});
 testReportBindings.set(report,{key:integrationKey(candidate,sessionId),fingerprint:latest.policy.fingerprint,
  receiptSignature:latest.receipt.signature,todos});
 return Object.freeze({status:report.status,report,acceptance:"not-accepted" as const,autoMerge:false as const});
}

/** Una integración exige evidencia genuina sobre el árbol exacto, según la
 * política de revisión aplicable, y pruebas firmadas en todos los casos. */
export async function verifyNativeIntegrationAcceptance(input:{
 candidate:NativeIntegrationCandidate;report:NativeIntegrationReviewReport;receipts:ReviewReceiptReader;sessionId:string;
}):Promise<Readonly<{status:"verified-awaiting-integration-consent";commit:string;tree:string;tests:number;reviewMode:"dual"|"joint-tests";writerAuthority:false;autoMerge:false}>>{
 const {candidate,report}=input;
 if(report.status==="joint-tests-reviewed"){
  const binding=testReportBindings.get(report);
  if(!binding||binding.key!==integrationKey(candidate,input.sessionId)||!isIssuedNativeIntegrationCandidate(candidate))
   throw Error("La revisión proporcional no fue emitida para este candidato y sesión.");
  const receipt=await exactPassingReceipt(candidate,input.receipts);
  const policy=await inspectPartitionPolicy(candidate,input.sessionId,binding.todos);
  if(policy.fingerprint!==binding.fingerprint||receipt.signature!==binding.receiptSignature)
   throw Error("La política ODD o recibo revisado cambió; no integrar.");
  return Object.freeze({status:"verified-awaiting-integration-consent",commit:candidate.commit,tree:candidate.tree,
   tests:receipt.testSuite.total,reviewMode:"joint-tests",writerAuthority:false,autoMerge:false});
 }
 if(!isIssuedNativeIntegrationCandidate(candidate)||!isIssuedJudgmentDayReport(report)||
  reportBindings.get(report)!==integrationKey(candidate,input.sessionId)||
  report.sessionId!==input.sessionId||report.candidateRevision!==candidate.tree||
  report.candidateTreeIdentity!==candidate.tree||report.status!=="analysis-complete"||
  report.judges.length!==2||new Set(report.judges.map(judge=>judge.reviewerId)).size!==2||
  report.judges.some(judge=>judge.verdict!=="pass"||judge.identity?.status!=="declared-match")||report.findings.length)
  throw new Error("Two genuine passing independent judges on the exact integrated tree are required");
 const receipt=await exactPassingReceipt(candidate,input.receipts);
 return Object.freeze({status:"verified-awaiting-integration-consent",commit:candidate.commit,tree:candidate.tree,
  tests:receipt.testSuite.total,reviewMode:"dual",writerAuthority:false,autoMerge:false});
}

const acceptedIntegrations=new WeakMap<object,string>();
export type AcceptedNativeIntegration=Readonly<{status:"integrated";batchId:string;commit:string;tree:string;sessionId:string;repository:string;tests:number;remotePush:false;writerAuthority:false}>;
export function isAcceptedNativeIntegration(value:unknown,candidate:NativeIntegrationCandidate,sessionId:string):value is AcceptedNativeIntegration{
 return !!value&&typeof value==="object"&&acceptedIntegrations.get(value)===integrationKey(candidate,sessionId);
}
/** Integración LOCAL exclusivamente por avance rápido, después de aceptar los
 * dos jueces y las pruebas firmadas. Nunca cambia main/master ni publica Git. */
export async function acceptNativeIntegration(input:Parameters<typeof verifyNativeIntegrationAcceptance>[0]&{
 validate:()=>Promise<void>;confirm:(summary:string)=>Promise<boolean>;
}):Promise<AcceptedNativeIntegration|undefined>{
 const {candidate}=input;
 const eol=checkoutEolSettings(candidate.repository).args;
 const git=(args:readonly string[],hooks?:string)=>execFileSync("git",["--no-replace-objects","-c","core.fsmonitor=false",
  "-c","submodule.recurse=false","-c","commit.gpgSign=false",...eol,...(hooks?["-c","core.hooksPath="+hooks]:[]),
  "-C",candidate.repository,...args],{encoding:"utf8",env:isolatedGitEnvironment(),timeout:20000,maxBuffer:1000000,windowsHide:true});
 const head=()=>git(["rev-parse","HEAD"]).trim();
 const marker=join(git(["rev-parse","--absolute-git-dir"]).trim(),"asen-integration-"+candidate.batchId+".json");
 const markerText=(branch:string)=>JSON.stringify([branch,candidate.batchId,candidate.baseCommit,candidate.commit,candidate.tree,input.sessionId]);
 const readMarker=()=>{
  const first=lstatSync(marker,{throwIfNoEntry:false});if(!first)return undefined;
  if(!first.isFile()||first.isSymbolicLink()||first.size>4096)throw Error("Registro de integración inseguro");
  const fd=openSync(marker,process.platform==="win32"?constants.O_RDONLY:constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
   const same=(value:ReturnType<typeof fstatSync>)=>value.isFile()&&value.dev===first.dev&&value.ino===first.ino&&
    value.size===first.size&&value.mtimeMs===first.mtimeMs&&value.ctimeMs===first.ctimeMs;
   if(!same(fstatSync(fd)))throw Error("Registro de integración cambiado");
   const bytes=Buffer.alloc(4097),size=readSync(fd,bytes,0,bytes.length,0);
   const last=lstatSync(marker);
   if(size!==first.size||!same(fstatSync(fd))||!same(last)||last.isSymbolicLink())throw Error("Registro de integración cambiado");
   return new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(0,size));
  }finally{closeSync(fd);}
 };
 const ensureMarker=(branch:string)=>{
  const expected=markerText(branch),existing=readMarker();
  if(existing!==undefined){if(existing!==expected)throw Error("Registro de integración pertenece a otro candidato");return;}
  const fd=openSync(marker,"wx",0o600);
  try{writeFileSync(fd,expected);fsyncSync(fd);}finally{closeSync(fd);}
 };
 const inspect=()=>{
  if(realpathSync(git(["rev-parse","--show-toplevel"]).trim())!==realpathSync(candidate.repository))
   throw new Error("La integración requiere el proyecto original.");
  const branch=git(["symbolic-ref","HEAD"]).trim();
  if(!branch.startsWith("refs/heads/")||["refs/heads/main","refs/heads/master"].includes(branch.toLowerCase()))throw new Error("Integración bloqueada en rama principal o sin rama.");
  if(head()!==candidate.baseCommit&&head()!==candidate.commit)throw new Error("El HEAD original cambió.");
  // No ejecutar filtros o drivers externos configurados por el repositorio.
  try{
   const config=git(["config","--get-regexp","^(filter\\.|merge\\..*\\.driver$|diff\\..*\\.command$)"]);
   if(config.trim())throw new Error("Configuración Git externa no admitida para integrar.");
  }catch(error){if((error as {status?:number})?.status!==1)throw error;}
  const current=head(),pending=readMarker();
  if(pending!==undefined&&pending!==markerText(branch))throw Error("Registro de integración pertenece a otra rama o candidato");
  const dirty=git(["status","--porcelain=v1","--untracked-files=all"]).length>0;
  const prepared=dirty&&current===candidate.baseCommit&&pending===markerText(branch)&&
   git(["write-tree"]).trim()===candidate.tree&&
   !git(["diff","--name-only","--no-ext-diff","--no-textconv"]).trim()&&
   !git(["ls-files","--others","--exclude-standard","-z"]).length;
  if(dirty&&!prepared)throw new Error("La integración requiere el proyecto original limpio o una preparación exacta registrada.");
  return {branch,head:current,prepared,pending:pending??null};
 };
 await input.validate();const evidence=await verifyNativeIntegrationAcceptance(input),initial=inspect();
 if(await input.confirm(["Integrar localmente el candidato verificado "+candidate.commit,
  "Rama: "+initial.branch,"Árbol: "+candidate.tree,"Archivos: "+candidate.paths.join(", "),
  (evidence.reviewMode==="dual"?"Dos jueces PASS":"Lectura humana y política ODD de bajo/medio riesgo; sin revisión independiente")+"; pruebas firmadas: "+evidence.tests,
  ...(initial.prepared?["Reanudar una transición registrada con el índice y archivos exactos."]:[]),
  "Sin push, sin main/master, sin reintentos ni permiso Writer heredado."].join("\n"))!==true)return undefined;
 await input.validate();await verifyNativeIntegrationAcceptance(input);await input.validate();
 if(JSON.stringify(inspect())!==JSON.stringify(initial))throw new Error("La rama o candidato cambió durante la aprobación.");
 if(initial.head===candidate.baseCommit){
  const hooks=mkdtempSync(join(tmpdir(),"asen-integration-hooks-"));
  try{
   // Git read-tree hace una transición de dos árboles sin --reset. Nunca
   // resolver HEAD como destino de la actualización de una referencia.
   // read-tree puede sobrescribir ignorados: rechazar colisiones de antemano.
   const untracked=git(["ls-files","--others","-z"],hooks).split("\0").filter(Boolean);
   if(untracked.some(path=>candidate.paths.some(changed=>path===changed||path.startsWith(changed+"/")||changed.startsWith(path+"/"))))
    throw Error("Hay archivos locales que colisionan con el candidato.");
   if(JSON.stringify(inspect())!==JSON.stringify(initial))throw Error("La rama autorizada cambió antes de preparar los archivos.");
   ensureMarker(initial.branch);
   if(!initial.prepared)git(["read-tree","-m","-u",candidate.baseCommit,candidate.commit],hooks);
   // La preparación del índice no concede permiso para otra rama. Si hay
   // concurrencia, detenerse y conservar el estado para inspección manual.
   if(git(["symbolic-ref","HEAD"],hooks).trim()!==initial.branch||
      git(["rev-parse","--verify",initial.branch],hooks).trim()!==initial.head||
      git(["write-tree"],hooks).trim()!==candidate.tree||
      git(["diff","--name-only","--no-ext-diff","--no-textconv"],hooks).trim())
    throw Error("El checkout cambió durante la integración; inspeccionar sin reintento.");
   // CAS de la referencia explícita y directa. Aunque HEAD cambie en este
   // instante, Git no puede avanzar main/master ni otra rama.
   git(["update-ref","--no-deref",initial.branch,candidate.commit,initial.head],hooks);
  }
  finally{rmSync(hooks,{recursive:true,force:true});}
 }
 await input.validate();
 const final=inspect();
 if(final.branch!==initial.branch||final.head!==candidate.commit||git(["rev-parse","HEAD^{tree}"]).trim()!==candidate.tree)
  throw new Error("Integración incierta; no activar sucesoras.");
 // No borrar un registro ajeno; la revisión y aprobación actuales son
 // imprescindibles también si se reabre el proceso tras el avance de Git.
 if(readMarker()===markerText(final.branch))rmSync(marker);
 const accepted=Object.freeze({status:"integrated" as const,batchId:candidate.batchId,commit:candidate.commit,tree:candidate.tree,
  sessionId:input.sessionId,repository:candidate.repository,tests:evidence.tests,remotePush:false as const,writerAuthority:false as const});
 acceptedIntegrations.set(accepted,integrationKey(candidate,input.sessionId));return accepted;
}
