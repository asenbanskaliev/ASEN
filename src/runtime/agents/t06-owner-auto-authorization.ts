/** Consentimiento del propietario para dos Writers Pi en carpetas temporales.
 * Solo el push exacto y el primer intento son válidos; no autoriza fusionar. */
export const MENSAJE_T06_AUTOMATICO="ci(asen): probar dos Writers T06 NVIDIA una vez";
const SHA=/^[a-f0-9]{40}$/u;
export function autorizaT06EscrituraAislada(e:NodeJS.ProcessEnv):boolean{
 return e.ASEN_T06_AUTO_OWNER==="1"&&
  e.ASEN_T06_STATIC_WRITE_ONLY==="1"&&
  e.ASEN_T06_COST_ACK==="true"&&
  e.GITHUB_ACTIONS==="true"&&
  e.GITHUB_REPOSITORY==="asenbanskaliev/ASEN"&&
  e.GITHUB_ACTOR==="asenbanskaliev"&&
  e.GITHUB_EVENT_NAME==="push"&&
  e.GITHUB_REF==="refs/heads/feat/flujo-de-agentes-20261115"&&
  e.GITHUB_RUN_ATTEMPT==="1"&&
  e.GITHUB_RUN_ID==="44792916571"&&
  e.GITHUB_SHA==="5bd752374f2db630a9d2ab0887e1025134a4e13f"&&
  /^[1-9][0-9]{0,16}$/u.test(e.GITHUB_RUN_ID??"")&&
  SHA.test(e.GITHUB_SHA??"")&&
  e.GITHUB_SHA===e.ASEN_T06_EXPECTED_SHA&&
  e.ASEN_T06_HEAD_COMMIT_MESSAGE===MENSAJE_T06_AUTOMATICO;
}
