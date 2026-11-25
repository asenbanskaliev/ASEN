/** Pruebas conjuntas explícitas de un candidato aún congelado. El recibo
 * certifica los casos ejecutados, no la suficiencia de la selección ni una
 * revisión independiente. Nunca autoriza integrar ni concede permiso Writer. */
import {inspectPartitionPolicy} from "./native-integration-review.js";
import {isIssuedNativeIntegrationCandidate,readNativeIntegrationDiff,type NativeIntegrationCandidate} from "../agents/parallel-native-integration.js";
import type {SessionTodoStore} from "./todo-store.js";
import {executeFrozenNodePassingObservation,claimPassingTestObservation} from "../../test/tdd-observation.js";
import {createReviewReceiptSigned,loadReceiptSigningKey,writeReviewReceipt} from "../../evidence/review-receipt.js";
import {ReceiptVerifierService} from "../../evidence/receipt-verifier.js";
import {validatePortableReviewPaths} from "../../review/review-tree-paths.js";
import {hasSensitiveName} from "../../security/primary-tool-policy.js";

const active=new Set<string>();
export async function testNativeIntegrationCandidate(input:{
 candidate:NativeIntegrationCandidate;sessionId:string;todos:Pick<SessionTodoStore,"list">;storageDir:string;
 testPaths:readonly string[];validate:()=>Promise<void>;confirm:(summary:string)=>Promise<boolean>;signal?:AbortSignal;
}){
 const {candidate,sessionId,todos,storageDir}=input;
 if(!isIssuedNativeIntegrationCandidate(candidate))throw Error("Se necesita un candidato auténtico");
 const paths=validatePortableReviewPaths(input.testPaths);
 if(!paths.length||paths.length>64||paths.some(path=>hasSensitiveName(path)||!/(?:^|\/)[^/]+\.(?:test|spec)\.(?:js|mjs|cjs)$/u.test(path)))
  throw Error("Seleccionar de 1 a 64 rutas relativas exactas de pruebas Node JS, MJS o CJS");
 const key=JSON.stringify([candidate.repository,candidate.commit]);
 if(active.has(key))throw Error("Ya hay pruebas activas de este candidato");
 active.add(key);
 try{
  const verify=async()=>{
   if(input.signal?.aborted)throw Error("Pruebas canceladas");
   await input.validate();readNativeIntegrationDiff(candidate);
   const policy=await inspectPartitionPolicy(candidate,sessionId,todos);
   await input.validate();
   if(input.signal?.aborted)throw Error("Pruebas canceladas");
   return policy;
  };
  const initial=await verify();
  const receipts=new ReceiptVerifierService(storageDir);
  const prior=await receipts.readReceiptState(candidate.commit);
  if(prior.status!=="absent")throw Error("Ya existe un recibo para este commit; revisar su estado antes de ejecutar de nuevo");
  if(await input.confirm(["Pruebas conjuntas Node del candidato "+candidate.commit,"Árbol: "+candidate.tree,
   "Archivos seleccionados (deben ser pruebas de confianza suficientes para las dos unidades):",...paths,
   "Se ejecutará código de prueba real en un checkout temporal, sin credenciales heredadas y con restricciones de Node.",
   "No es un aislamiento de seguridad para código hostil. No autorices pruebas desconocidas o peligrosas.",
   "Solo lectura, sin instalación automática ni procesos hijos; puede no admitir todos los proyectos.",
   "El recibo no concede permiso Writer, no acredita revisión independiente y no integra."].join("\n"))!==true)
   return Object.freeze({status:"declined" as const,autoMerge:false,writerAuthority:false});
  if((await verify()).fingerprint!==initial.fingerprint)throw Error("El plan cambió durante la autorización");
  const exact={id:"asen-"+candidate.commit.slice(0,12),repository:candidate.repository,revision:candidate.commit,createdAt:new Date().toISOString()};
  const observation=await executeFrozenNodePassingObservation(exact,{baseRevision:candidate.baseCommit,tree:candidate.tree,testPaths:paths,...(input.signal?{signal:input.signal}:{})});
  const proof=claimPassingTestObservation(observation);
  if(proof.candidateRepository!==candidate.repository||proof.candidateRevision!==candidate.commit||proof.candidateId!==exact.id||proof.exitCode!==0)
   throw Error("La evidencia de ejecución no coincide");
  const count=observation.executedCaseIds.length;
  if(!count)throw Error("No se ejecutó ninguna prueba");
  if((await verify()).fingerprint!==initial.fingerprint)throw Error("El plan cambió durante las pruebas");
  if((await receipts.readReceiptState(candidate.commit)).status!=="absent")throw Error("Otro proceso guardó un recibo; no sustituir");
  const signingKey=await loadReceiptSigningKey(storageDir);
  if((await verify()).fingerprint!==initial.fingerprint)throw Error("El plan cambió antes de firmar");
  const receipt=createReviewReceiptSigned({commitSha:candidate.commit,treeSha:candidate.tree,oddTask:"native-partition:"+candidate.batchId,
   testSuite:{total:count,passed:count,failed:0,durationMs:Math.max(0,Date.parse(proof.finishedAt)-Date.parse(proof.startedAt)),runner:"node --test (candidato congelado, rutas seleccionadas por usuario)"},
   verdict:"PASSED",metadata:{adapter:observation.adapterId,testPaths:[...observation.testPaths],caseIds:[...observation.executedCaseIds],commandFingerprint:observation.commandFingerprint,sessionId,batchId:candidate.batchId,independentReview:false}},signingKey);
  await writeReviewReceipt(storageDir,receipt);
  const persisted=await receipts.readReceiptState(candidate.commit);
  if(persisted.status!=="valid"||persisted.receipt.signature!==receipt.signature)throw Error("No se pudo verificar el recibo persistido");
  return Object.freeze({status:"tests-signed" as const,commit:candidate.commit,tree:candidate.tree,tests:count,receiptId:receipt.receiptId,autoMerge:false,writerAuthority:false});
 }finally{active.delete(key);}
}
