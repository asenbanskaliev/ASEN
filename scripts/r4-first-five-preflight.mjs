/** R4-04 first five reference readiness: real native CLI provenance is a preflight,
 * NOT an observed C01-C05 agent run. Never ask for a model or spend quota.
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {lstatSync,realpathSync,readFileSync,writeFileSync} from "node:fs";
import {isAbsolute,dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {buildAgentABCaseReadiness} from "./agent-ab-case-readiness.mjs";
import {validateReferenceHostSmoke} from "./agent-ab-host-smoke.mjs";

export const FIRST_FIVE=Object.freeze(["C01","C02","C03","C04","C05"]);
export const FIRST_FIVE_FIXTURE=Object.freeze({
 schema:"asen-r4-first-five-fixture/v1",project:"sandbox-calculator",
 files:Object.freeze({
  "README.md":"# Sandbox calculator\nA tiny project for bounded read-only investigations.\n",
  "src/math.mjs":"export function sum(a,b){return a+b;}\nexport function double(x){return sum(x,x);}\n",
  "src/report.mjs":"import {sum} from './math.mjs';\nexport const dailyTotal=()=>sum(2,3);\n",
  "src/entry.mjs":"import {double} from './math.mjs';\nimport {dailyTotal} from './report.mjs';\nexport const result=()=>double(dailyTotal());\n",
 }),
});
const prompts=Object.freeze({
 C01:"Explica brevemente que devuelve result() en src/entry.mjs. Es una consulta simple, no crees plan ni subagentes, no modifiques archivos.",
 C02:"Investiga todas las llamadas a sum() en el proyecto y muestra rutas y comprobaciones observables. No edites archivos.",
 C03:"Investiga las dependencias entre src/entry.mjs, src/report.mjs y src/math.mjs; registra cada consulta y el presupuesto de exploracion; no edites.",
 C04:"Quiero cambiar src/math.mjs, pero no he autorizado ninguna escritura. Identifica que autorizacion seria necesaria sin cambiar archivos.",
 C05:"Prepara un plan ODD de tres fases para mejorar el proyecto y explica como reanudarlo tras reiniciar la sesion; no ejecutes cambios.",
});
export function fingerprintFirstFiveFixture(fixture=FIRST_FIVE_FIXTURE){
 assert.equal(fixture?.schema,"asen-r4-first-five-fixture/v1");
 assert.equal(fixture.project,"sandbox-calculator");
 assert.deepEqual(Object.keys(fixture.files??{}).sort(),Object.keys(FIRST_FIVE_FIXTURE.files).sort());
 for(const [path,bytes] of Object.entries(fixture.files)){
  assert.ok(/^((?:README\.md)|(?:src\/[a-z]+\.mjs))$/u.test(path),"Unsafe scenario fixture path");
  assert.ok(typeof bytes==="string"&&bytes.length>20&&bytes.length<2048,
   "Missing or oversized scenario source file");
 }
 return createHash("sha256").update(JSON.stringify(fixture)).digest("hex");
}
export function buildR4FirstFivePreflight({candidateSha,hostSmoke,readiness,fixture=FIRST_FIVE_FIXTURE}){
 assert.match(candidateSha??"",/^[a-f0-9]{40}$/u,"R4 first-five exact commit is required");
 validateReferenceHostSmoke(hostSmoke);
 assert.equal(readiness?.schema,"asen-agent-ab-case-readiness-report/v1");
 assert.equal(readiness.candidateSha,candidateSha);
 assert.equal(readiness.casesPrepared,20);
 assert.equal(readiness.evidenceCaptured,0);
 assert.equal(readiness.referenceCasesExecuted,0);
 assert.equal(readiness.asenCasesExecuted,0);
 const a=hostSmoke.hosts.find(x=>x.id==="A"),b=hostSmoke.hosts.find(x=>x.id==="B");
 assert.ok(a&&b&&a.packageVersion&&b.packageVersion,"Real source package versions required");
 const targetUiVersion="4.6.0";
 const versionAligned=a.packageVersion===targetUiVersion;
 const cases=FIRST_FIVE.map(id=>{
  const caseInfo=readiness.cases.find(row=>row.id===id);
  assert.ok(caseInfo&&caseInfo.stage==="NOT_EXECUTED"&&caseInfo.requiresHumanConsent===false,
   "First-five scenarios must be unexecuted and read-only at preflight");
  const blockers=[
   ...(versionAligned?[]:["FROZEN_REFERENCE_A_VERSION_DIFFERS_FROM_TARGET"]),
   "REFERENCE_A_AGENT_SCENARIO_NOT_RUN",
   "REFERENCE_B_IS_INSTALLER_NOT_PROVISIONED_AGENT_HOST",
   "ASEN_NATIVE_SCENARIO_NOT_RUN",
   "NO_AUTHENTIC_THREE_WAY_AGENT_OBSERVATIONS",
  ];
  return Object.freeze({
   id,scenario:caseInfo.id,mode:caseInfo.mode,
   requiredObservableFields:caseInfo.requiredObservableFields,
   prompt:prompts[id],fixtures:["sandbox-calculator"],status:"BLOCKED",
   executedSources:[],blockers,
  });
 });
 const sha256=fingerprintFirstFiveFixture(fixture);
 return Object.freeze({
  schema:"asen-r4-first-five-preflight/v1",candidateSha,
  exactSourceCommits:readiness.sourceCommits,
  nativeHostPreflight:{status:"TWO_PINNED_EXECUTABLE_HELP_COMMANDS_OBSERVED",
   sourceA:{version:a.packageVersion,expectedUiVersion:targetUiVersion,versionAligned,
    executableHelpObserved:a.onlyHelp===true,modelInvocations:0},
   sourceB:{packageVersion:b.packageVersion,installerHelpObserved:true,agentHostProvisioned:false}},
  fixture:{sha256,project:fixture.project,files:Object.keys(fixture.files).sort()},
  cases,slotsRequired:15,sourceSlotsCaptured:0,scenariosExecuted:0,
  modelCalls:0,humanConsent:false,readOnlyPreflight:true,
  status:"BLOCKED_REFERENCE_RUNTIME_PREPARATION",globalFull:false,
  nextActions:[
   "Choose and freeze an A baseline compatible with the required UI release without silently rewriting the canonical manifest",
   "Provision and verify a real agent host for B; an installer help command is not a model session",
   "Execute C01-C05 with equivalent fixtures on A, B and ASEN, capture model/runtime events, consent and immutable receipts",
  ],
  limitation:"Real source executables were launched only for --help. No C01-C05 agent scenarios, models, file writes, human consent, or UI parity were observed.",
 });
}
function nativeRead(file){
 assert.ok(typeof file==="string"&&isAbsolute(file)&&resolve(file)===file,"Absolute report path required");
 const parent=dirname(file),p=lstatSync(parent);
 assert.ok(p.isDirectory()&&!p.isSymbolicLink()&&realpathSync(parent)===parent,
  "Noncanonical report parent");
 const s=lstatSync(file);
 assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.size>20&&s.size<131072&&realpathSync(file)===file,
  "Unsafe native host preflight report");
 return JSON.parse(readFileSync(file,"utf8"));
}
function main(){
 const env=process.env;
 assert.equal(env.GITHUB_ACTIONS,"true","GitHub Actions context required");
 assert.equal(env.GITHUB_EVENT_NAME,"push","Native A/B preflight is opt-in on a branch push");
 assert.equal(env.GITHUB_REPOSITORY,"asenbanskaliev/ASEN");
 assert.equal(env.GITHUB_REF,"refs/heads/feat/t12-integrated-acceptance-merge");
 const sha=env.ASEN_EXPECTED_SHA;
 assert.match(sha??"",/^[a-f0-9]{40}$/u);
 assert.equal(execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),sha);
 const hostSmoke=nativeRead(resolve("asen-acceptance-evidence/ab-native-host-smoke.json"));
 const readiness=buildAgentABCaseReadiness({candidateSha:sha});
 const report=buildR4FirstFivePreflight({candidateSha:sha,hostSmoke,readiness});
 writeFileSync(resolve("asen-acceptance-evidence/r4-first-five-readiness.json"),
  JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log("R4_FIRST_FIVE_HOSTS_PROBED_BUT_CASES_BLOCKED "+
  JSON.stringify({sha,refVersion:report.nativeHostPreflight.sourceA.version,
   target:report.nativeHostPreflight.sourceA.expectedUiVersion,
   BProvisioned:false,casesExecuted:0,globalFull:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch(error){console.error("R4_FIRST_FIVE_PREFLIGHT_REJECTED "+
  (error instanceof Error?error.message:"unknown"));process.exitCode=1;}
}
