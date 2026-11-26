/** T06: solo recibos del mismo SHA con 17 casos aislados completos
 * habilitan pedir dos opiniones Pi. Nunca habilitan FULL ni Writer. */
import {createHash} from "node:crypto";
import {validateT06Handoff} from "./t06-behavior-handoff.js";
type Data=Record<string,unknown>;
const obj=(x:unknown):x is Data=>
 !!x&&typeof x==="object"&&!Array.isArray(x);
const expected=[
 {name:"t06-writer-a.mjs",count:9},
 {name:"t06-writer-b.mjs",count:8}
] as const;
export function verifyT06IndependentReviewInputs(input:{
 readonly expectedSha:string;readonly report:unknown;readonly manifest:unknown;
 readonly files:Readonly<Record<string,Buffer>>;readonly behavior:unknown;
}):Readonly<{allowed:boolean;reason:string;globalFull:false}>{
 const blocked=(reason:string)=>Object.freeze({allowed:false,reason,globalFull:false as const});
 if(!validateT06Handoff(input))
  return blocked("Los archivos no concuerdan con los recibos de escritura");
 const b=input.behavior;
 if(!obj(b)||b.schema!=="asen.t06.isolated-behavior/v1"||
  b.sha!==input.expectedSha||b.status!=="candidate-behavior-passed"||
  b.networkDisabled!==true||b.providerSecretsAbsent!==true||
  b.behaviorVerified!==true||b.isolated!==true||b.accepted!==false||
  b.globalFull!==false||b.providerUsageVerified!==false||
  b.billingVerified!==false||b.independentlyReviewed!==false||
  !Array.isArray(b.writers)||b.writers.length!==2)
  return blocked("No hay 17 pruebas de comportamiento aisladas verificadas");
 for(let i=0;i<2;i++){
  const w:unknown=b.writers[i],target=expected[i]!;
  if(!obj(w)||w.name!==target.name||w.verified!==true||
   w.completed!==target.count||w.reason!=="casos-externos-superados")
   return blocked("Casos del archivo "+(i+1)+" incompletos");
  const buffer=input.files[target.name];
  if(!Buffer.isBuffer(buffer)||buffer.length===0||buffer.length>10_000)
   return blocked("Archivo no válido");
 }
 return Object.freeze({allowed:true,reason:"Evidencia del mismo SHA apta solo para revisión",
  globalFull:false as const});
}
/** Identidad del archivo incluida en la petición de revisión.
 * Nunca se confía en el resumen del propio modelo para decidir la huella. */
export function t06ReviewHashes(files:Readonly<Record<string,Buffer>>):
 Readonly<Record<string,string>>{
 return Object.freeze(Object.fromEntries(expected.map(({name})=>{
  const bytes=files[name];
  if(!Buffer.isBuffer(bytes))throw Error("T06: falta archivo esperado");
  return [name,createHash("sha256").update(bytes).digest("hex")];
 })));
}
