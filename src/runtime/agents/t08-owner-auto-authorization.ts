/** T08 experimental: el propietario autoriza un lote aislado de dos jueces,
 * una reparación en carpeta temporal y nuevas revisiones. Nunca autoriza Git.
 * No sustituye la aprobación de la vía manual histórica. */
export const T08_AUTO_MENSAJE="ci(asen): ejecutar T08 NVIDIA sin aprobaciones";
export function autorizarT08Auto(e:NodeJS.ProcessEnv=process.env):boolean{
 return e.ASEN_T08_OWNER_AUTO==="1"&&e.ASEN_T08_COST_ACK==="true"&&
  e.ASEN_T08_REVIEW_A==="nvidia/nemotron-3.5-bolt-e4b"&&
  e.ASEN_T08_REVIEW_B==="nvidia/nemotron-3.5-super-vl-120b-a12b"&&
  e.ASEN_T08_WRITER_MODEL==="nvidia/nemotron-3.5-lightning-30b-a3b"&&
  e.GITHUB_ACTIONS==="true"&&
  e.GITHUB_REPOSITORY==="asenbanskaliev/ASEN"&&
  e.GITHUB_ACTOR==="asenbanskaliev"&&e.GITHUB_EVENT_NAME==="push"&&
  e.GITHUB_REF==="refs/heads/feat/flujo-de-agentes-20261115"&&
  e.GITHUB_RUN_ATTEMPT==="1"&&
  /^[1-9][0-9]{0,15}$/u.test(e.GITHUB_RUN_ID??"")&&
  /^[a-f0-9]{40}$/u.test(e.GITHUB_SHA??"")&&
  e.GITHUB_SHA===e.ASEN_T08_EXPECTED_SHA&&
  e.ASEN_T08_HEAD_COMMIT_MESSAGE===T08_AUTO_MENSAJE;
}
export function isGithubHostedT08AutoSandboxRun(e:NodeJS.ProcessEnv=process.env):boolean{
 return e.ASEN_DOCKER_TESTS_CI==="1"&&
  e.RUNNER_ENVIRONMENT==="github-hosted"&&e.RUNNER_OS==="Linux"&&
  autorizarT08Auto(e);
}
