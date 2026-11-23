/** Ensayo E2A. Dos procesos Pi auténticos; ámbitos de prueba desechables.
 * No equivale a permisos de usuario dentro del Pi ni a aceptación final.
 */
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {createT06ReadOnlyGitFixture} from "../src/runtime/agents/t06-read-only-git-fixture.js";
import {normalizeT06PiChildSelection} from "../src/runtime/agents/t06-pi-receipt-validator.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {Dispatcher} from "../src/agents/dispatcher.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {issueOddDecision} from "../tests/helpers/odd-routing.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {decideLifecycleApplicability} from "../src/lifecycle/applicability.js";
import {issueOrganicWriterAdmission} from "../src/lifecycle/skill-lifecycle.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
import {isolatedGitEnvironment} from "../src/runtime/agents/git-isolated-environment.js";

const model="nvidia/nemotron-3.5-lightning-30b-a3b";
const expectedSha=process.env.ASEN_EXPECTED_SHA;
const reportFile=process.env.ASEN_E2A_NVIDIA_REPORT;
const root=resolve(process.env.GITHUB_WORKSPACE??process.cwd());
if(!process.env.NVIDIA_API_KEY||!reportFile||!expectedSha||
 !/^[a-f0-9]{40}$/u.test(expectedSha)||
 execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim()!==expectedSha)
 throw new Error("E2A bloqueado: proveedor, SHA o archivo de recibo ausente");
const hash=(data:string)=>createHash("sha256").update(data).digest("hex");
// La selección Pi-native exige que las skills estén dentro de cada worktree.
const selectedSkills=selectSkills({phase:"apply",codeChange:true,risk:"high"}).map(x=>x.path);
const fixture=createT06ReadOnlyGitFixture({skillRoot:root,skillPaths:selectedSkills});
// Cada Writer consume su propio archivo privado de atribución antes de escribir.
mkdirSync(dirname(resolve(reportFile)),{recursive:true,mode:0o700});
const observations=[0,1].map(()=>({pid:0,start:0,end:0,model:"unknown",
 writeStarts:0,writeEnds:0,writeErrors:0,toolErrors:0}));
const paths=["a.txt","b.txt"] as const;
// Contenido sin salto final: los modelos Pi no siempre respetan el salto en la última línea.
// La comprobación sigue siendo exacta byte por byte y NO admite escrituras adicionales.
const contents=paths.map((_,i)=>"ASEN-E2A-"+(i===0?"A":"B"));
const report={
 schema:"asen.e2a.nvidia-writer/v1",sha:expectedSha,
 provider:model,authorization:"ONLY_TEST_FIXTURE_NOT_PI_HUMAN_CONSENT",
 costVerified:false,autoRetry:false,autoMerge:false,globalFull:false,
 results:[] as Array<Record<string,unknown>>,parallel:false,
 isolation:false,sourceClean:false,status:"BLOCKED",
 failureCode:null as null|"POST_DISPATCH_EXCEPTION"|"INCOMPLETE_WORKER_PROCESS"|"CLEANUP_FAILED"
};
const workers=fixture.children.map((project,i)=>{
 const path=paths[i]!,content=contents[i]!;
 const id="e2a-ensayo-"+(i===0?"a":"b"),session="e2a-sesion-"+(i===0?"a":"b");
 const candidate={id,repository:project,revision:fixture.head,createdAt:new Date().toISOString()};
 const decision=issueOddDecision({taskId:id,repository:project,paths:[path],
  writes:[{path,changeKind:"behavior"}]});
 const plan=buildOrchestrationPlan({taskId:id,repository:project,
  prompt:"Escribir un archivo de prueba aislado",candidate},decision);
 if(!plan.routeEvidence)throw Error("Falta ruta ODD autenticada");
 const applicability=decideLifecycleApplicability(decision,{
  taskIdentity:id,repositoryIdentity:project,
  candidate:{id,repository:project,revision:fixture.head},
  explicitMode:"organic",affectedSubsystems:["ensayo"],
  expectedPaths:[path],requiredArtifacts:[]
 });
 const writerAdmission=issueOrganicWriterAdmission(applicability,[path]);
 const skillContext=issueSkillContext(id+":worker",project,candidate,{
  phase:"apply",codeChange:true,risk:"high"
 });
 const skillPaths=selectSkills(skillContext).map(x=>x.path);
 const evidence=new EvidenceStore();
 evidence.addRouteDecision(candidate,plan.routeEvidence,{
  id:id+":ruta",summary:"Ruta E2A sintética, sin permiso Pi de usuario",
  createdAt:new Date().toISOString()
 });
 for(const [key,kind] of [["work-unit","work-unit"],["scope","scope"],["rollback","rollback"]] as const)
  evidence.add(candidate,{id:id+":"+key,kind,status:"pass",
   summary:"Escritura limitada al archivo de ensayo",createdAt:new Date().toISOString()});
 const observed=observations[i]!;
 const runner=new PiProcessRunner({
  command:"pi",policyRoot:root,providerCredential:"NVIDIA_API_KEY",
  requireChildModelBeforePrompt:true,oneShotWritePath:path,
  attributionFile:join(dirname(resolve(reportFile)),id+"-attribution.json"),
  exactWriteReceipt:{path,fileSha256:hash(content)},
  timeoutMs:110_000,maxOutputBytes:60_000,maxStreamBytes:240_000,
  onProcessStart:pid=>{observed.pid=pid;observed.start=performance.now();},
  onProcessClose:()=>{observed.end=performance.now();},
  onToolExecution:e=>{
   // Un intento denegado de lectura o edición también invalida el ensayo.
   if(e.type==="tool_execution_end"&&e.isError)observed.toolErrors++;
   if(e.toolName==="write"&&e.type==="tool_execution_start")observed.writeStarts++;
   if(e.toolName==="write"&&e.type==="tool_execution_end"){
    observed.writeEnds++;if(e.isError)observed.writeErrors++;
   }
  }
 });
 runner.subscribeChildSelection(e=>{
  if(e.sessionId===session&&e.projectId===project)
   observed.model=normalizeT06PiChildSelection(e.model,model)??"unknown";
 });
 const request={id:id+":worker",role:"worker" as const,repository:project,
  isolationKey:session,candidate,writeSurfaces:[path],skillContext,skillPaths,
  writerAdmission,model,thinking:"minimal" as const,
  prompt:"Prueba autorizada sobre un repositorio sintético. Usa UNA llamada nativa a "+
   "write para reemplazar solamente "+path+" con este contenido UTF-8 exacto:\n"+
   content+"\nNo uses shell, no hagas commits ni alteres otros archivos. Detente tras escribir."
 };
 return {project,id,path,content,dispatcher:new Dispatcher(runner,evidence),request};
});
try{
 const settled=await Promise.allSettled(workers.map(w=>w.dispatcher.dispatch(w.request)));
 const git=(cwd:string,...args:string[])=>execFileSync("git",["-C",cwd,...args],{
  encoding:"utf8",stdio:["ignore","pipe","ignore"],env:isolatedGitEnvironment()
 });
 for(let i=0;i<workers.length;i++){
  const w=workers[i]!,o=observations[i]!,out=settled[i]!;
  const exact=existsSync(join(w.project,w.path))&&
   readFileSync(join(w.project,w.path),"utf8")===w.content;
  const changed=git(w.project,"status","--porcelain=v1","--untracked-files=all")
   .split(/\r?\n/u).filter(Boolean).map(x=>x.slice(3));
  const scopeExact=changed.length===1&&changed[0]===w.path;
  const accepted=out.status==="fulfilled"&&out.value.ok===true;
  const detail=out.status==="fulfilled"&&!out.value.ok?out.value.output:"";
  // El motivo del fallo del despacho se comprueba antes de mirar archivos que no se escribieron.
  const reason=out.status==="rejected"?"DESPACHO_EXCEPCION":
   o.writeStarts>1?"SEGUNDA_ESCRITURA_BLOQUEADA":
   o.toolErrors>0?"HERRAMIENTA_PI_FALLIDA_O_DENEGADA":
   !accepted?
    /pi native Skill paths do not match|skill path error/u.test(detail)?"SKILLS_NO_CARGADAS":
    /Pi child model selection was not confirmed/u.test(detail)?"MODELO_NO_CONFIRMADO":
    /pi ASEN policy extension was not/u.test(detail)?"AUTORIDAD_PI_NO_CARGADA":
    /pi assistant failed:/u.test(detail)?"PROVEEDOR_DEVOLVIO_ERROR":
    /timed out/u.test(detail)?"TIEMPO_AGOTADO":
    /pi process exited/u.test(detail)?"PI_SALIO_SIN_RESPUESTA":
    "DESPACHO_NO_VALIDADO":
   !exact?"CONTENIDO_DISTINTO_AL_AUTORIZADO":
   !scopeExact?"ARCHIVOS_FUERA_DE_AMBITO":
   o.model!==model?"MODELO_NO_CONFIRMADO":
   "RESPUESTA_NO_VERIFICADA";
  const checked=accepted&&exact&&
   scopeExact&&o.model===model&&o.pid>0&&o.end>o.start&&
   o.writeStarts===1&&o.writeEnds===1&&o.writeErrors===0&&o.toolErrors===0;
  report.results.push({taskId:w.id,verified:checked,reason:checked?null:reason,
   nativeWriteErrors:o.writeErrors,nativeToolErrors:o.toolErrors,changedPaths:changed,
   observedSha256:existsSync(join(w.project,w.path))?hash(readFileSync(join(w.project,w.path),"utf8")):null,
   pidObserved:o.pid>0,
   modelObserved:o.model,oneNativeWrite:o.writeStarts===1&&o.writeEnds===1,
   exactBytes:exact,exactScope:scopeExact,
   fileHash:exact?hash(w.content):null});
 }
 report.parallel=observations.every(o=>o.pid>0&&o.end>o.start)&&
  new Set(observations.map(o=>o.pid)).size===2&&
  Math.max(...observations.map(o=>o.start))<Math.min(...observations.map(o=>o.end));
 const gitState=fixture.observe();
 report.isolation=gitState.isolated&&gitState.children.length===2&&
  gitState.children.every(x=>x.linked&&x.pinned);
 report.sourceClean=gitState.sourceClean;
 report.status=report.parallel&&report.isolation&&report.sourceClean&&
  report.results.every(x=>x.verified===true)?"PASS_NATIVE_WRITERS_TEST_ONLY":"BLOCKED";
}catch{
 // Código fijo: no registrar errores del proveedor, prompts, rutas ni datos privados.
 report.status="BLOCKED";
 report.failureCode="POST_DISPATCH_EXCEPTION";
}finally{
 const complete=observations.every(o=>o.pid>0&&o.end>o.start);
 if(!complete){
  report.status="BLOCKED";
  report.failureCode??="INCOMPLETE_WORKER_PROCESS";
 }else{
  try{fixture.cleanup();}catch{
   report.status="BLOCKED";
   report.failureCode="CLEANUP_FAILED";
  }
 }
 // Persistir el resultado definitivo, incluida cualquier incertidumbre de limpieza.
 const output=resolve(reportFile);
 mkdirSync(dirname(output),{recursive:true,mode:0o700});
 writeFileSync(output,JSON.stringify(report,null,2)+"\n",{
  encoding:"utf8",mode:0o600,flag:"wx"
 });
}
process.stdout.write(JSON.stringify({status:report.status,parallel:report.parallel,
 writersVerified:report.results.filter(x=>x.verified===true).length})+"\n");
if(report.status!=="PASS_NATIVE_WRITERS_TEST_ONLY")process.exitCode=1;
