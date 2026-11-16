/** Una sola ejecución protegida: valida recibos T06 reales y pruebas T07.
 * NO inventa una unión entre Pi TUI y los diarios ODD que este ensayo no contiene.
 * No invoca proveedores ni agentes y nunca concede permiso de escritura.
 */
import {lstatSync,readFileSync,writeFileSync} from "node:fs";
import {join,resolve,isAbsolute} from "node:path";
import {spawnSync} from "node:child_process";
import {assessT06T07Trial} from "../src/runtime/ui/t06-t07-trial-evidence.js";
const sha=process.env.ASEN_T06_EXPECTED_SHA??"";
const dir=process.env.ASEN_T06_WRITER_REPORT_DIR??"";
if(!/^[0-9a-f]{40}$/u.test(sha)||!isAbsolute(dir)||
 process.env.GITHUB_ACTIONS!=="true"||
 process.env.GITHUB_EVENT_NAME!=="workflow_dispatch"||
 process.env.GITHUB_REF!=="refs/heads/feat/flujo-de-agentes-20261115")
 throw Error("T06+T07 bloqueado: requiere workflow manual y SHA exacto");
const evidencePath=join(dir,"t06-dual-native-evidence.json");
const stat=lstatSync(evidencePath);
if(!stat.isFile()||stat.isSymbolicLink()||stat.size>120_000)
 throw Error("T06+T07 bloqueado: informe ausente, simbólico o excesivo");
const raw=readFileSync(evidencePath,"utf8");
let report:unknown=null;try{report=JSON.parse(raw) as unknown;}catch{}
const tests=[
 "tests/agent-flow-overview.test.ts",
 "tests/ide-panel.test.ts",
 "tests/native-work-panel.test.ts",
 "tests/parallel-worktree-todos.test.ts"
];
const env={...process.env};
for(const key of Object.keys(env)){
 if(/(?:API_KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL)/iu.test(key))delete env[key];
}
const child=spawnSync(process.execPath,["--import","tsx","--test",...tests],{
 cwd:resolve("."),env,encoding:"utf8",timeout:210_000,
 maxBuffer:256*1024,stdio:["ignore","pipe","pipe"]
});
const uiPassed=child.status===0&&child.error===undefined&&child.signal===null;
const result=assessT06T07Trial({report,expectedSha:sha,uiTestPassed:uiPassed});
const status=Object.freeze({
 schema:"asen.t06-t07.same-run-trial/v1",sha,
 result:result.status,blockers:result.blockers,
 t06NativeWritersVerified:result.nativePiWritersVerified,
 t07RendererTestsPassed:result.uiRendererTestedInSameRun,
 uiConnectedToLivePiSessions:false,realPiTuiObserved:false,
 durableChildTodoAttributionVerified:false,
 t07TestExitCode:child.status,
 autoRetry:false,autoMerge:false,globalFull:false
});
writeFileSync(join(dir,"t06-t07-integrated-evidence.json"),JSON.stringify(status,null,2)+"\n",{
 encoding:"utf8",flag:"wx",mode:0o600
});
console.log(JSON.stringify({status:status.result,sha,
 t06NativeWritersVerified:status.t06NativeWritersVerified,
 t07RendererTestsPassed:status.t07RendererTestsPassed,
 realPiTuiObserved:false,globalFull:false,
 blockers:status.blockers}));
if(result.status!=="two-real-writers-ui-renderer-tests-only")process.exitCode=1;
