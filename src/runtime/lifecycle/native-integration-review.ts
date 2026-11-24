/** Dos jueces Pi auténticos sobre el árbol combinado, sin entregar código al
 * Writer ni confundir el informe de modelos con pruebas o aceptación. */
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,realpathSync} from "node:fs";
import {join} from "node:path";
import {isolatedGitEnvironment} from "../agents/git-isolated-environment.js";
import {readFrozenIntegrationReviewEvidence} from "../../review/workspace-review-session.js";
import {runJudgmentDay,isIssuedJudgmentDayReport,type JudgmentDayReport} from "../../review/judgment-day.js";
import {availableIndependentPiReviewers,type PiReviewRegistry,type PiReviewerModel} from "../../review/pi-model-reviewer.js";
import {proposeJudgmentFixHandoff} from "../../review/odd-agent-review-flow.js";
import type {JudgmentFixProposalJournal} from "../../review/judgment-fix-proposal-journal.js";
import type {RouteChoice} from "./profiles.js";
import type {ReviewReceiptReader} from "./review-acceptance.js";
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
 const isAuthor=(m:PiReviewerModel)=>authors.has(key(m))||authors.has(m.provider+"/"+(m.id.startsWith(m.provider+"/")?m.id.slice(m.provider.length+1):m.id))||authors.has(m.provider+"/"+key(m));
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
 if(!a||!b||key(a)===key(b)||input.judgeA?.thinking!==undefined||input.judgeB?.thinking!==undefined)
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

/** No se activa una sucesora ni se admite una integración con un resumen del
 * modelo. Se exigen dos veredictos genuinos, mismo árbol y recibo firmado. */
export async function verifyNativeIntegrationAcceptance(input:{
 candidate:NativeIntegrationCandidate;report:JudgmentDayReport;receipts:ReviewReceiptReader;sessionId:string;
}):Promise<Readonly<{status:"verified-awaiting-integration-consent";commit:string;tree:string;tests:number;writerAuthority:false;autoMerge:false}>>{
 const {candidate,report}=input;
 if(!isIssuedNativeIntegrationCandidate(candidate)||!isIssuedJudgmentDayReport(report)||
  reportBindings.get(report)!==integrationKey(candidate,input.sessionId)||
  report.sessionId!==input.sessionId||report.candidateRevision!==candidate.tree||
  report.candidateTreeIdentity!==candidate.tree||report.status!=="analysis-complete"||
  report.judges.length!==2||new Set(report.judges.map(judge=>judge.reviewerId)).size!==2||
  report.judges.some(judge=>judge.verdict!=="pass")||report.findings.length)
  throw new Error("Two genuine passing independent judges on the exact integrated tree are required");
 readNativeIntegrationDiff(candidate);
 const state=await input.receipts.readReceiptState(candidate.commit);
 if(state.status!=="valid"||state.receipt.verdict!=="PASSED"||state.receipt.treeSha!==candidate.tree||
  state.receipt.commitSha!==candidate.commit||!Number.isSafeInteger(state.receipt.testSuite.total)||
  state.receipt.testSuite.total<1||state.receipt.testSuite.passed!==state.receipt.testSuite.total||
  state.receipt.testSuite.failed!==0)
  throw new Error("Authenticated passing test receipt of the exact integration candidate is required");
 return Object.freeze({status:"verified-awaiting-integration-consent",commit:candidate.commit,tree:candidate.tree,
  tests:state.receipt.testSuite.total,writerAuthority:false,autoMerge:false});
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
 const git=(args:readonly string[],hooks?:string)=>execFileSync("git",["--no-replace-objects","-c","core.fsmonitor=false",
  "-c","submodule.recurse=false","-c","commit.gpgSign=false",...(hooks?["-c","core.hooksPath="+hooks]:[]),
  "-C",candidate.repository,...args],{encoding:"utf8",env:isolatedGitEnvironment(),timeout:20000,maxBuffer:1000000,windowsHide:true});
 const head=()=>git(["rev-parse","HEAD"]).trim();
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
  if(git(["status","--porcelain=v1","--untracked-files=all"]).length)throw new Error("La integración requiere el proyecto original limpio.");
  return {branch,head:head()};
 };
 await input.validate();const evidence=await verifyNativeIntegrationAcceptance(input),initial=inspect();
 if(await input.confirm(["Integrar localmente el candidato verificado "+candidate.commit,
  "Rama: "+initial.branch,"Árbol: "+candidate.tree,"Archivos: "+candidate.paths.join(", "),
  "Dos jueces PASS; pruebas firmadas: "+evidence.tests,
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
   git(["read-tree","-m","-u",candidate.baseCommit,candidate.commit],hooks);
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
 const accepted=Object.freeze({status:"integrated" as const,batchId:candidate.batchId,commit:candidate.commit,tree:candidate.tree,
  sessionId:input.sessionId,repository:candidate.repository,tests:evidence.tests,remotePush:false as const,writerAuthority:false as const});
 acceptedIntegrations.set(accepted,integrationKey(candidate,input.sessionId));return accepted;
}
