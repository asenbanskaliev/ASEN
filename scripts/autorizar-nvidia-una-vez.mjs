/** Autorización acotada a un único cambio GitHub, sin aprobaciones de entorno.
 * No autoriza Writers, fusiones, reintentos ni ejecución por PR.
 * El consentimiento de coste se liga al commit explícito del propietario. */
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

export const MENSAJE_NVIDIA_UNICO="ci(asen): ejecutar prueba única NVIDIA autorizada";
const SHA=/^[a-f0-9]{40}$/u;
export function autorizarNvidiaUnaVez(e=process.env){
 return e.GITHUB_ACTIONS==="true"&&
  e.GITHUB_REPOSITORY==="asenbanskaliev/ASEN"&&
  e.GITHUB_EVENT_NAME==="push"&&
  e.GITHUB_ACTOR==="asenbanskaliev"&&
  e.GITHUB_REF==="refs/heads/feat/flujo-de-agentes-20261115"&&
  e.GITHUB_RUN_ATTEMPT==="1"&&
  e.GITHUB_RUN_ID==="44790981792"&&
  e.GITHUB_SHA==="08c484560fac6e0d599e3872e366993c1e07cba0"&&
  /^[1-9][0-9]{0,16}$/u.test(e.GITHUB_RUN_ID??"")&&
  SHA.test(e.GITHUB_SHA??"")&&
  e.GITHUB_SHA===e.ASEN_NVIDIA_EXPECTED_SHA&&
  e.ASEN_NVIDIA_COST_ACK==="1"&&
  e.ASEN_NVIDIA_HEAD_COMMIT_MESSAGE===MENSAJE_NVIDIA_UNICO;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(!autorizarNvidiaUnaVez()){
  console.error("Prueba NVIDIA denegada: falta una autorización única y verificable del cambio.");
  process.exitCode=1;
 }else{
  process.stdout.write(JSON.stringify({
   autorizacion:"una-ejecucion",sha:process.env.GITHUB_SHA,
   proveedor:"nvidia",maxPeticionesApi:2,maxTokensApiPorPeticion:128,
   maxSesionesPiLectura:2,reintentos:0,
   permisosEscritura:false,aprobacionManualDeEntorno:false,
   aceptacionCompleta:false,globalFull:false
  })+"\n");
 }
}
