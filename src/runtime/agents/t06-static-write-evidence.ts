/** T06: acredita únicamente una escritura Pi. NUNCA ejecuta código generado.
 * La comprobación de comportamiento y la aceptación siguen pendientes. */
import {assessT06WriterEvidence,type T06WriterEvidenceInput} from "./t06-writer-evidence.js";

export type T06StaticWriterAssessment=Readonly<{
 readonly writeOnlyVerified:boolean;
 readonly behaviorVerified:false;
 readonly acceptance:"not-accepted";
 readonly globalFull:false;
 readonly blockers:readonly string[];
 readonly writeToolObserved:boolean;
 readonly writeStarts:number;
 readonly writeSuccesses:number;
 readonly writeFailures:number;
}>;

/** El único bloqueo admitido es la prueba de comportamiento no ejecutada.
 * Un fallo de escritura, origen, atribución, sintaxis o modelo nunca se oculta. */
export function assessT06StaticWriteOnly(
 input:Omit<T06WriterEvidenceInput,"behaviorOk">
):T06StaticWriterAssessment{
 const original=assessT06WriterEvidence({...input,behaviorOk:false});
 const writeOnlyVerified=original.blockers.length===1&&
  original.blockers[0]==="behavior-tests-failed"&&original.writeToolObserved;
 return Object.freeze({
  writeOnlyVerified,behaviorVerified:false as const,
  acceptance:"not-accepted" as const,globalFull:false as const,
  blockers:Object.freeze([...original.blockers]),
  writeToolObserved:original.writeToolObserved,
  writeStarts:original.writeStarts,
  writeSuccesses:original.writeSuccesses,
  writeFailures:original.writeFailures
 });
}
