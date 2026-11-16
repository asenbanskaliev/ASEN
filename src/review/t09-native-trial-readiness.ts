/** T09: lectura prudente del informe de la prueba nativa T06.
 * Es una DECLARACIÓN del controlador, no una atestación externa del proveedor,
 * revisión T10, aceptación del código ni prueba de equivalencia A/B. */
type Data=Record<string,unknown>;
const object=(value:unknown):value is Data=>
 value!==null&&typeof value==="object"&&!Array.isArray(value)&&
 Object.getPrototypeOf(value)===Object.prototype;
const hex40=/^[0-9a-f]{40}$/u;
const hex64=/^[0-9a-f]{64}$/u;
const model=/^nvidia\/[A-Za-z0-9._-]{3,100}$/u;
const expectations=[
 {id:"t06-writer-a",scope:"t06-writer-a.mjs"},
 {id:"t06-writer-b",scope:"t06-writer-b.mjs"}
] as const;
export interface T09NativeTrialReadiness{
 readonly status:"blocked"|"candidate-evidence-only";
 readonly blockers:readonly string[];
 readonly measurements:Readonly<{
  readonly workerCount:2;
  readonly observedWindowMs:number;
  readonly observedOverlapMs:number;
  readonly workerDurationsMs:readonly [number,number];
 }> | null;
 readonly providerUsageVerified:false;
 readonly billingVerified:false;
 readonly referenceCompared:false;
 readonly qualityIndependentlyVerified:false;
 readonly authorized:false;
 readonly acceptance:"not-accepted";
 readonly globalFull:false;
}
const validNumber=(value:unknown):value is number=>
 typeof value==="number"&&Number.isSafeInteger(value)&&value>0&&value<=600_000;
const blocked=(reason:string):T09NativeTrialReadiness=>Object.freeze({
 status:"blocked" as const,blockers:Object.freeze([reason]),measurements:null,
 providerUsageVerified:false as const,billingVerified:false as const,
 referenceCompared:false as const,qualityIndependentlyVerified:false as const,
 authorized:false as const,acceptance:"not-accepted" as const,
 globalFull:false as const
});
/** El SHA esperado proviene del checkout exacto, nunca del propio informe.
 * No se admiten métricas estimadas, coste supuesto o un Writer que solo habló. */
export function assessT09NativeTrialReadiness(input:{
 readonly report:unknown;
 readonly expectedSha:string;
}):T09NativeTrialReadiness{
 const report=input?.report,sha=input?.expectedSha;
 if(!object(report)||typeof sha!=="string"||!hex40.test(sha)||
  report.schema!=="asen.t06.native-dual-writer/v1"||
  report.sha!==sha||report.piVersion!=="1.2.0"||
  !model.test(String(report.requestedModel??""))||
  !((report.executionKind==="NATIVE_PI_RPC_WRITER_WITH_TWO_GITHUB_APPROVALS"&&
    report.consentMethod==="two-distinct-github-environment-human-approvals-not-native-pi-TUI")||
   (report.executionKind==="NATIVE_PI_RPC_WRITER_WITH_TWO_MANUAL_TERMINAL_APPROVALS"&&
    report.consentMethod==="two-distinct-interactive-parent-terminal-prompts-not-native-pi-TUI"))||
  report.modelCostVerified!==false||report.billingVerified!==false||
  report.distinctWorktrees!==true||report.distinctSessions!==true||
  report.concurrent!==true||report.autoRetry!==false||
  report.autoMerge!==false||report.accepted!==false||report.globalFull!==false)
  return blocked("t06-source-provenance-or-sha-invalid");
 if(!["PASS_TWO_REAL_WRITERS_NEEDS_INDEPENDENT_REVIEW",
       "PASS_TWO_REAL_WRITERS_AND_PI_REVIEWS_NEEDS_T10"].includes(String(report.result)))
  return blocked("t06-did-not-pass-real-writer-tests");
 const workers=report.workers;
 if(!Array.isArray(workers)||workers.length!==2)
  return blocked("t06-worker-count-invalid");
 const sessions=new Set<string>();
 const durations:number[]=[];
 for(let i=0;i<2;i++){
  const row:unknown=workers[i],expected=expectations[i]!;
  if(!object(row)||row.worker!==expected.id||row.scope!==expected.scope||
   typeof row.session!=="string"||
   !/^t06-child-[0-9a-f-]{36}$/u.test(row.session)||
   sessions.has(row.session)||
   row.requestedModel!==report.requestedModel||
   row.observedModel!==report.requestedModel||
   row.processObserved!==true||row.nativeResultOk!==true||
   row.writeToolObserved!==true||row.attributionVerified!==true||
   row.attributionEntries!==1||
   row.writeStarts!==1||row.writeSuccesses!==1||row.writeFailures!==0||
   !Array.isArray(row.blockers)||row.blockers.length!==0||
   row.exactScope!==true||row.syntaxOk!==true||
   row.behaviorOk!==true||row.passed!==true||
   !hex64.test(String(row.fileSha256??""))||
   !validNumber(row.durationMs))
   return blocked("t06-worker-"+(i+1)+"-not-verified");
  sessions.add(row.session);
  durations.push(row.durationMs);
 }
 const window=report.observedWindowMs,overlap=report.observedOverlapMs;
 if(!validNumber(window)||!validNumber(overlap)||
  overlap>Math.min(...durations)+2||
  window<Math.max(...durations)-2||
  window>durations[0]!+durations[1]!+2||
  Math.abs((durations[0]!+durations[1]!-overlap)-window)>4)
  return blocked("t06-observed-timing-inconsistent");
 return Object.freeze({
  status:"candidate-evidence-only" as const,
  blockers:Object.freeze([] as string[]),
  measurements:Object.freeze({
   workerCount:2 as const,observedWindowMs:window,
   observedOverlapMs:overlap,
   workerDurationsMs:Object.freeze([durations[0]!,durations[1]!] as const)
  }),
  providerUsageVerified:false as const,billingVerified:false as const,
  referenceCompared:false as const,qualityIndependentlyVerified:false as const,
  authorized:false as const,acceptance:"not-accepted" as const,
  globalFull:false as const
 });
}
