/** Evidencia de un mismo run manual T06 y pruebas T07, SIN afirmar TUI real.
 * Las sesiones y la UI persistida del flujo productivo NO se pueden demostrar
 * a partir de un informe de Writer independiente del AgentRuntime/Todo.
 */
export type T06T07TrialAssessment=Readonly<{
 status:"blocked"|"two-real-writers-ui-renderer-tests-only";
 blockers:readonly string[];
 nativePiWritersVerified:boolean;
 uiRendererTestedInSameRun:boolean;
 uiConnectedToLivePiSessions:false;
 realPiTuiObserved:false;
 durableChildTodoAttributionVerified:false;
 globalFull:false;
}>;
const isRecord=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const expectedModel="nvidia/nemotron-3.5-lightning-30b-a3b";
const entries=[
 {worker:"t06-writer-a",scope:"t06-writer-a.mjs"},
 {worker:"t06-writer-b",scope:"t06-writer-b.mjs"}
] as const;
/** Rechaza un recibo parcial o falsamente atribuido; no autoriza modelos ni escritura. */
export function assessT06T07Trial(input:{
 report:unknown;expectedSha:string;uiTestPassed:boolean;
}):T06T07TrialAssessment{
 const blockers:string[]=[];
 const {report,expectedSha,uiTestPassed}=input;
 if(!/^[0-9a-f]{40}$/u.test(expectedSha))blockers.push("sha-invalido");
 if(!isRecord(report))blockers.push("informe-ausente");
 const r=isRecord(report)?report:{};
 if(r.schema!=="asen.t06.native-dual-writer/v1"||r.sha!==expectedSha)
  blockers.push("recibo-t06-candidato-no-coincide");
 if(typeof r.piVersion!=="string"||!/(?:^|\s)1\.2\.0(?:\s|$)/u.test(r.piVersion))
  blockers.push("pi-version-sin-acreditar");
 if(r.executionKind!=="NATIVE_PI_RPC_WRITER_WITH_TWO_GITHUB_APPROVALS"||
  r.consentMethod!=="two-distinct-github-environment-human-approvals-not-native-pi-TUI")
  blockers.push("aprobaciones-github-no-acreditadas");
 if(r.distinctWorktrees!==true||r.distinctSessions!==true||r.concurrent!==true||
  r.autoRetry!==false||r.autoMerge!==false||r.accepted!==false||r.globalFull!==false)
  blockers.push("aislamiento-concurrencia-o-autoridad-invalida");
 if(r.requestedModel!==expectedModel)
  blockers.push("modelo-solicitado-inesperado");
 if(!Array.isArray(r.workers)||r.workers.length!==2)
  blockers.push("numero-de-workers-invalido");
 const observed:Array<Record<string,unknown>>=Array.isArray(r.workers)?
  r.workers.filter(isRecord):[];
 const uniqueSessions=new Set<string>(),uniqueScopes=new Set<string>();
 for(const expected of entries){
  const matching=observed.filter(w=>w.worker===expected.worker);
  if(matching.length!==1){blockers.push(expected.worker+"-sin-identidad-unica");continue;}
  const w=matching[0]!;
  if(typeof w.session!=="string"||!/^t06-child-[0-9a-f-]{36}$/u.test(w.session))
   blockers.push(expected.worker+"-sin-sesion-pi");
  else uniqueSessions.add(w.session);
  if(w.scope!==expected.scope)blockers.push(expected.worker+"-scope-incorrecto");
  else uniqueScopes.add(w.scope);
  if(w.requestedModel!==expectedModel||w.observedModel!==expectedModel)
   blockers.push(expected.worker+"-modelo-no-verificado");
  if(w.processObserved!==true||w.nativeResultOk!==true||
   w.writeToolObserved!==true||w.exactScope!==true||
   w.syntaxOk!==true||w.behaviorOk!==true||
   w.attributionVerified!==true||w.attributionEntries!==1||
   w.writeStarts!==1||w.writeSuccesses!==1||w.writeFailures!==0||
   w.passed!==true||!Array.isArray(w.blockers)||w.blockers.length!==0||
   typeof w.fileSha256!=="string"||!/^[0-9a-f]{64}$/u.test(w.fileSha256)||
   typeof w.durationMs!=="number"||!Number.isFinite(w.durationMs)||w.durationMs<0)
   blockers.push(expected.worker+"-escritura-real-sin-demostrar");
 }
 if(uniqueSessions.size!==2||uniqueScopes.size!==2)
  blockers.push("sesion-o-scope-reutilizados");
 if(r.result!=="PASS_TWO_REAL_WRITERS_AND_PI_REVIEWS_NEEDS_T10"&&
  r.result!=="PASS_TWO_REAL_WRITERS_NEEDS_INDEPENDENT_REVIEW")
  blockers.push("t06-no-superado");
 if(uiTestPassed!==true)blockers.push("pruebas-ui-fallidas");
 return Object.freeze({
  status:blockers.length===0?"two-real-writers-ui-renderer-tests-only":"blocked",
  blockers:Object.freeze(blockers),nativePiWritersVerified:blockers.every(b=>b==="pruebas-ui-fallidas")&&
   !blockers.includes("recibo-t06-candidato-no-coincide")&&isRecord(report),
  uiRendererTestedInSameRun:uiTestPassed===true,
  uiConnectedToLivePiSessions:false as const,
  realPiTuiObserved:false as const,
  durableChildTodoAttributionVerified:false as const,
  globalFull:false as const
 });
}
