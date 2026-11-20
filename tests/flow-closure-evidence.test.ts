import test from "node:test";
import assert from "node:assert/strict";
import {auditFlowPoints16to18,inspectFlow17,inspectComparison16,inspectPiMatrix18,
 isPiMatrixReceiptPath,type PiMatrixEvidence,type FlowEndToEndWitness} from "../src/runtime/agents/flow-closure-evidence.js";
import type {AgentFlowSeriesPair} from "../src/review/agent-flow-series-comparison.js";

const sha="a".repeat(40),reference="ce64a9a708e50c0ca899c8023140e63f29f293e1";
const mkMatrix=():PiMatrixEvidence[]=>["linux","win32","darwin"].flatMap(platform=>
 ["tui","rpc","json","print"].map(mode=>({
  id:platform+"-1.2.0-"+mode,platform:platform as PiMatrixEvidence["platform"],
  mode:mode as PiMatrixEvidence["mode"],version:"1.2.0",
  candidate:sha,artifactSha256:"c".repeat(64),result:"PASS" as const,
  observation:{mode,hasUI:mode==="tui",commands:["asen"],
   tools:["asen_ask_choice","ask_user_choice","ask_user_question"],
   modelCalls:0,shutdownObserved:true,exitCode:0,signal:null,
   timedOut:false,keyboardCommandObserved:mode==="tui"}
 })));
test("18 exige las 12 celdas reales y nunca infiere capacidad de Writer autónomo",()=>{
 const result=inspectPiMatrix18(sha,mkMatrix());
 assert.equal(result.status,"evidence-ready-for-independent-audit");
 assert.equal(result.cellsObserved,12);
 assert.equal(result.authenticatedWriterSupported,false);
 assert.equal(result.autonomousChildLaunchProven,false);
 assert.equal(result.globalFull,false);
});
test("18 bloquea versiones equivocadas, ausencias, duplicados y datos de salida falsos",()=>{
 const rows=mkMatrix();
 const changed=[
  rows.slice(1),
  [...rows.slice(0,11),rows[0]!],
  rows.map((row,i)=>i===0?{...row,candidate:"b".repeat(40)}:row),
  rows.map((row,i)=>i===0?{...row,version:"1.5.2"}:row),
  rows.map((row,i)=>i===0?{...row,result:"SKIP" as const}:row),
  rows.map((row,i)=>i===0?{...row,observation:{...row.observation!,modelCalls:1}}:row),
  rows.map((row,i)=>i===0?{...row,observation:{...row.observation!,shutdownObserved:false}}:row),
 ];
 for(const candidate of changed)assert.equal(inspectPiMatrix18(sha,candidate).status,"blocked");
});
const writer=(id:"a"|"b")=>({
 taskId:"tarea-"+id,sessionId:"sesion-"+id,worktree:"trabajo-"+id,
 modelActual:"nvidia/modelo-"+id,candidateSha:sha,
 authorizedPaths:["src/"+id+".ts"],changedPaths:["src/"+id+".ts"],
 startedAtMs:id==="a"?100:200,completedAtMs:id==="a"?400:500,
 piProcessObserved:true,providerReceiptObserved:true,humanGrantVerified:true,
 testsPassed:true,nativeWriteObserved:true
});
const flow=():FlowEndToEndWitness=>({
 candidateSha:sha,githubRunId:"44755907429",writers:[writer("a"),writer("b")],
 review:{modelA:"nvidia/revisor-a",modelB:"nvidia/revisor-b",
  judgeAReceiptObserved:true,judgeBReceiptObserved:true,
  verdictA:"pass",verdictB:"pass",unresolvedFindings:0},
 joinedTestsPassed:true,exactCandidateChecked:true,
 humanAcceptanceVerified:true,automaticMerge:false
});
test("17 recibe solo una propuesta de auditoría, jamás aceptación automática",()=>{
 const result=inspectFlow17(sha,flow());
 assert.equal(result.status,"evidence-ready-for-independent-audit");
 assert.equal(result.evidenceOnly,true);
 assert.equal(result.accepted,false);
 assert.equal(result.globalFull,false);
});
test("17 rechaza conflictos, permisos, ejecuciones sin solape y revisión incompleta",()=>{
 const ok=flow(),a=ok.writers[0]!,b=ok.writers[1]!;
 const rejected:FlowEndToEndWitness[]=[
  {...ok,writers:[a,{...b,sessionId:a.sessionId}]},
  {...ok,writers:[a,{...b,changedPaths:a.changedPaths}]},
  {...ok,writers:[a,{...b,authorizedPaths:a.authorizedPaths}]},
  {...ok,writers:[a,{...b,startedAtMs:500,completedAtMs:600}]},
  {...ok,writers:[a,{...b,humanGrantVerified:false}]},
  {...ok,writers:[a,{...b,nativeWriteObserved:false}]},
  {...ok,review:{...ok.review,judgeBReceiptObserved:false}},
  {...ok,review:{...ok.review,verdictA:"unknown"}},
  {...ok,humanAcceptanceVerified:false},
  {...ok,githubRunId:"no-es-real"}
 ];
 assert.equal(inspectFlow17(sha,null).status,"blocked");
 for(const candidate of rejected)
  assert.equal(inspectFlow17(sha,candidate).status,"blocked");
});
test("16 no confunde 18 recibos falsos o inexistentes con una comparación real",()=>{
 assert.equal(inspectComparison16(sha,null).status,"blocked");
 const malformed=[{scenario:"directo",repetition:1,asen:{commit:sha},
  reference:{commit:reference}}] as unknown as AgentFlowSeriesPair[];
 assert.equal(inspectComparison16(sha,malformed).status,"blocked");
 assert.equal(inspectComparison16(sha,[]).status,"blocked");
});
test("informe conjunto 16-18 nunca declara finalizado sin verificación independiente",()=>{
 const report=auditFlowPoints16to18({sha,matrix:mkMatrix(),flow:null,pairs:null});
 assert.equal(report.point18.status,"evidence-ready-for-independent-audit");
 assert.equal(report.point17.status,"blocked");
 assert.equal(report.point16.status,"blocked");
 assert.equal(report.globalFull,false);
 assert.throws(()=>auditFlowPoints16to18({sha:"no-es-sha",matrix:[],flow:null,pairs:null}));
});

test("18 incluye win32 al leer los recibos del mismo candidato en CI",()=>{
 for(const platform of ["linux","win32","darwin"])
  for(const mode of ["tui","rpc","json","print"]){
   assert.equal(isPiMatrixReceiptPath(platform+"-1.2.0-"+mode+".json"),true);
   assert.equal(isPiMatrixReceiptPath("matrix-evidence/"+platform+"-1.2.0-"+mode+".json"),true);
  }
 for(const name of ["win-1.2.0-rpc.json","win32-1.5.2-rpc.json",
  "../../win32-1.2.0-rpc.json","win32-1.2.0-other.json",
  "linux-1.2.0-rpc.json.bak","windows-1.2.0-rpc.json",
  "win32-1X2X0-rpcZjson"])
  assert.equal(isPiMatrixReceiptPath(name),false,name);
});
