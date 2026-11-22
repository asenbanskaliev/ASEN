/** Autorización por lote de revisión T06; no permite escribir ni fusionar.
 * Las fuentes y sus diecisiete pruebas ya se verificaron en otras ejecuciones. */
export const T06_REVISION_MENSAJE="ci(asen): revisar T06 con dos NVIDIA reales";
export const T06_REVISION_FUENTE="5bd752374f2db630a9d2ab0887e1025134a4e13f";
export const T06_REVISION_RUN="44792916571";
export const T06_PRUEBAS_RUN="44794317489";
export function autorizarT06RevisionAutomatica(e:NodeJS.ProcessEnv):boolean{
 return e.ASEN_T06_AUTO_REVIEW_ONLY==="1"&&
  e.ASEN_T06_COST_ACK==="true"&&
  e.GITHUB_ACTIONS==="true"&&e.GITHUB_REPOSITORY==="asenbanskaliev/ASEN"&&
  e.GITHUB_EVENT_NAME==="push"&&e.GITHUB_ACTOR==="asenbanskaliev"&&
  e.GITHUB_REF==="refs/heads/feat/flujo-de-agentes-20261115"&&
  e.GITHUB_RUN_ATTEMPT==="1"&&
  /^[1-9][0-9]{0,15}$/u.test(e.GITHUB_RUN_ID??"")&&
  /^[a-f0-9]{40}$/u.test(e.GITHUB_SHA??"")&&
  e.GITHUB_SHA===e.ASEN_T06_EXPECTED_SHA&&
  e.ASEN_T06_HEAD_COMMIT_MESSAGE===T06_REVISION_MENSAJE&&
  e.ASEN_T06_SOURCE_SHA===T06_REVISION_FUENTE&&
  e.ASEN_T06_SOURCE_RUN_ID===T06_REVISION_RUN&&
  e.ASEN_T06_BEHAVIOR_RUN_ID===T06_PRUEBAS_RUN&&
  e.ASEN_T06_REVIEW_MODEL_A==="nvidia/nemotron-3-super-120b-a12b"&&
  e.ASEN_T06_REVIEW_MODEL_B==="nvidia/nemotron-3.5-super-vl-120b-a12b";
}
