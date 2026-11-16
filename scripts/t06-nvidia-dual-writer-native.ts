/**
 * T06: prueba OPCIONAL y MANUAL de dos Writers Pi reales en Git worktrees.
 * Requiere dos respuestas humanas distintas en una terminal TTY.
 * NO es una prueba de consentimiento dentro del TUI de Pi ni un merge.
 * No ejecutar en CI con respuestas automatizadas ni generar PASS ficticio.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {isAbsolute,join} from "node:path";
import {createInterface} from "node:readline/promises";
import ts from "typescript";
import {Dispatcher} from "../src/agents/dispatcher.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {issueOddDecision} from "../tests/helpers/odd-routing.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {decideLifecycleApplicability} from "../src/lifecycle/applicability.js";
import {issueOrganicWriterAdmission} from "../src/lifecycle/skill-lifecycle.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
import {requireDistinctT06Approvals,t06LiveApprovalChallenge,type T06LiveWriterIntent} from "../src/runtime/agents/t06-live-consent.js";
import {runT06NativeIndependentReviews} from "./t06-native-independent-review.js";

const model="nvidia/nemotron-3.5-lightning-30b-a3b";
const definitions=[
 {suffix:"a",target:"t06-writer-a.mjs",fn:"sumEvenNumbers",
  instruction:"Implement export function sumEvenNumbers(numbers). Only arrays of finite integers are allowed; throw TypeError otherwise. Sum all even numbers, including negative ones. Return zero for an empty array. Do not mutate the input."},
 {suffix:"b",target:"t06-writer-b.mjs",fn:"normalizeNames",
  instruction:"Implement export function normalizeNames(items). Only arrays of strings are allowed; throw TypeError otherwise. Trim spaces, convert to lower case, ignore empty strings, deduplicate and return names sorted alphabetically. Do not mutate the input."}
] as const;
const digest=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
const git=(cwd:string,...args:string[])=>execFileSync("git",["-C",cwd,...args],{
 encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:12_000
}).trim();
function verifySource(file:string,fn:string):void{
 const code=readFileSync(file,"utf8");
 if(!code||code.length>10_000)throw Error("Writer output is missing or oversized");
 const parsed=ts.createSourceFile(file,code,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);
 if(parsed.parseDiagnostics.length||parsed.statements.length!==1)throw Error("Writer output is not one syntactically valid exported function");
 const declaration=parsed.statements[0];
 if(!declaration||!ts.isFunctionDeclaration(declaration)||declaration.name?.text!==fn||
  !declaration.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.ExportKeyword))
  throw Error("Writer output does not export the requested function");
 const forbidden=new Set(["process","globalThis","require","eval","Function",
  "fetch","Deno","Bun","module","Buffer","WebAssembly","constructor","__proto__"]);
 const walk=(node:ts.Node):void=>{
  if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)||
   ts.isImportEqualsDeclaration(node)||ts.isAwaitExpression(node)||
   ts.isIdentifier(node)&&forbidden.has(node.text)||
   ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)
   throw Error("Writer output contains prohibited runtime access");
  ts.forEachChild(node,walk);
 };
 walk(declaration);
}
/** Las pruebas semánticas se ejecutan en otro proceso SIN claves de proveedor. */
function checkBehavior(root:string,target:string,fn:string):boolean{
 const code=fn==="sumEvenNumbers"?
  `import assert from 'node:assert/strict';import {sumEvenNumbers as f} from './${target}';
   let input=[2,4,7,-8];assert.equal(f(input),-2);assert.deepEqual(input,[2,4,7,-8]);
   assert.equal(f([]),0);assert.equal(f([1,3,5]),0);
   assert.throws(()=>f("not-array"),TypeError);assert.throws(()=>f([1,2.5]),TypeError);
   assert.throws(()=>f([1,Infinity]),TypeError);`:
  `import assert from 'node:assert/strict';import {normalizeNames as f} from './${target}';
   const names=[" Ana ","ana","BETA"," beta "," "];
   assert.deepEqual(f(names),["ana","beta"]);assert.deepEqual(names,[" Ana ","ana","BETA"," beta "," "]);
   assert.deepEqual(f([]),[]);assert.throws(()=>f("Ana"),TypeError);
   assert.throws(()=>f(["Ana",7]),TypeError);`;
 const env:NodeJS.ProcessEnv={};
 for(const key of ["PATH","SYSTEMROOT","WINDIR","COMSPEC","PATHEXT","TEMP","TMP","TMPDIR","HOME","USERPROFILE"]){
  if(process.env[key])env[key]=process.env[key];
 }
 try{execFileSync(process.execPath,["--input-type=module","--eval",code],{
  cwd:root,env,stdio:["ignore","pipe","pipe"],timeout:4_000,maxBuffer:65_536
 });return true;}catch{return false;}
}
async function nativeWriter(
 root:string,intent:T06LiveWriterIntent,fn:string,instruction:string,policyRoot:string
){
 const target=intent.writeSurface,sha=git(root,"rev-parse","HEAD");
 const candidate={id:intent.taskId,repository:root,revision:sha,createdAt:new Date().toISOString()};
 const decision=issueOddDecision({
  taskId:intent.taskId,repository:root,paths:[target],writes:[{path:target,changeKind:"behavior"}]
 });
 const plan=buildOrchestrationPlan({taskId:intent.taskId,repository:root,prompt:instruction,candidate},decision);
 if(!plan.routeEvidence)throw Error("Native Writer has no candidate-bound route evidence");
 const applicability=decideLifecycleApplicability(decision,{
  taskIdentity:intent.taskId,repositoryIdentity:root,
  candidate:{id:candidate.id,repository:root,revision:sha},
  explicitMode:"organic",affectedSubsystems:["runtime"],
  expectedPaths:[target],requiredArtifacts:[]
 });
 const writerAdmission=issueOrganicWriterAdmission(applicability,[target]);
 const skillContext=issueSkillContext(intent.taskId+":worker",root,candidate,{
  phase:"apply",codeChange:true,risk:"medium"
 });
 const skillPaths=selectSkills(skillContext).map(skill=>skill.path);
 const evidence=new EvidenceStore();
 evidence.addRouteDecision(candidate,plan.routeEvidence,{
  id:intent.taskId+":route",summary:"Ruta ODD acotada de prueba T06",createdAt:new Date().toISOString()
 });
 for(const [name,kind] of [["work-unit","work-unit"],["scope","scope"],["rollback","rollback"]] as const){
  evidence.add(candidate,{id:intent.taskId+":"+name,kind,status:"pass",
   summary:"Autorización humana individual para el único archivo declarado",createdAt:new Date().toISOString()});
 }
 let pid:number|null=null,startedAt:number|null=null,endedAt:number|null=null,observedModel:string|null=null;
 const events:Array<{type:string;name?:string;id?:string;error?:boolean}>=[];
 const runner=new PiProcessRunner({
  command:process.env.PI_EXECUTABLE??"pi",policyRoot,providerCredential:"NVIDIA_API_KEY",
  timeoutMs:180_000,maxOutputBytes:80_000,maxStreamBytes:512_000,
  onProcessStart:processId=>{pid=processId;startedAt=performance.now();},
  onProcessClose:()=>{endedAt=performance.now();},
  onToolExecution:e=>events.push({type:e.type,...(e.toolName?{name:e.toolName}:{}),
   ...(e.toolCallId?{id:e.toolCallId}:{}),...(e.isError!==undefined?{error:e.isError}:{})})
 });
 runner.subscribeChildSelection(value=>{
  if(value.taskId!==intent.taskId+":worker"||value.sessionId!==intent.sessionId||
   value.projectId!==root||!value.model)return;
  observedModel=value.model.id.startsWith(value.model.provider+"/")?
   value.model.id:value.model.provider+"/"+value.model.id;
 });
 const prompt=[
  "Trabajo real autorizado SOLO para este archivo: "+target+".",
  instruction,
  "Escribe código JavaScript ES2022 en un solo archivo .mjs. Incluye una sola función exportada con el nombre "+fn+".",
  "Usa la herramienta nativa write de Pi y no respondas solo con código en el chat.",
  "Sin imports, sin dependencias externas, sin acceder a la red ni ejecutar comandos.",
  "No modifiques ningún otro archivo, no hagas commit ni fusiones."
 ].join("\n");
 const result=await new Dispatcher(runner,evidence).dispatch({
  id:intent.taskId+":worker",role:"worker",repository:root,
  isolationKey:intent.sessionId,prompt,candidate,writeSurfaces:[target],
  skillContext,skillPaths,writerAdmission,model,thinking:"minimal"
 });
 const starts=events.filter(e=>e.type==="tool_execution_start"&&e.name==="write");
 const ends=events.filter(e=>e.type==="tool_execution_end"&&e.name==="write"&&e.error===false);
 const realWrite=starts.length===1&&ends.length===1&&starts[0]?.id===ends[0]?.id;
 const file=join(root,target),present=existsSync(file);
 const observedPaths=git(root,"status","--porcelain=v1","--untracked-files=all")
  .split(/\r?\n/u).filter(Boolean).map(row=>row.slice(3));
 const exactScope=observedPaths.length===1&&observedPaths[0]===target;
 let syntaxOk=false,behaviorOk=false;
 if(present&&exactScope){
  try{verifySource(file,fn);syntaxOk=true;behaviorOk=checkBehavior(root,target,fn);}catch{}
 }
 return Object.freeze({
  worker:intent.taskId,session:intent.sessionId,scope:target,
  requestedModel:model,observedModel:observedModel??"unknown",
  processObserved:pid!==null,writeToolObserved:realWrite,
  nativeResultOk:result.ok,exactScope,syntaxOk,behaviorOk,
  durationMs:startedAt!==null&&endedAt!==null?Math.round(endedAt-startedAt):null,
  startedAt,endedAt,
  fileSha256:present?digest(readFileSync(file)):null,
  passed:result.ok&&realWrite&&exactScope&&syntaxOk&&behaviorOk&&observedModel===model&&pid!==null
 });
}
async function main():Promise<void>{
 const policyRoot=realpathSync(process.env.GITHUB_WORKSPACE??process.cwd());
 const expected=process.env.ASEN_T06_EXPECTED_SHA;
 if(!expected||!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(expected)||
  git(policyRoot,"rev-parse","HEAD")!==expected)
  throw Error("T06 bloqueado: especifica el SHA exacto del repositorio para la prueba");
 if(git(policyRoot,"status","--porcelain=v1","--untracked-files=all")!=="")
  throw Error("T06 bloqueado: el repositorio debe permanecer limpio");
 if(!process.env.NVIDIA_API_KEY)throw Error("T06 bloqueado: falta NVIDIA_API_KEY");
 const version=execFileSync(process.env.PI_EXECUTABLE??"pi",["--version"],{
  encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:5_000
 }).trim();
 if(!/(?:^|\s)1\.2\.0(?:\s|$)/u.test(version))throw Error("T06 bloqueado: se requiere Pi 1.2.0");
 if(!process.stdin.isTTY||!process.stdout.isTTY)
  throw Error("T06 bloqueado: dos consentimientos humanos deben introducirse en una terminal interactiva, no en CI");
 const dir=process.env.ASEN_T06_WRITER_REPORT_DIR?
  process.env.ASEN_T06_WRITER_REPORT_DIR:mkdtempSync(join(tmpdir(),"asen-t06-native-receipts-"));
 if(!isAbsolute(dir))throw Error("Directorio de informe T06 inválido");
 mkdirSync(dir,{recursive:true,mode:0o700});
 const roots=definitions.map(item=>mkdtempSync(join(tmpdir(),"asen-pi-writer-"+item.suffix+"-")));
 let prepared=false,launched=false;
 try{
  for(const root of roots){
   execFileSync("git",["-C",policyRoot,"worktree","add","--detach",root,expected],{
    stdio:"ignore",timeout:15_000
   });
   if(git(root,"rev-parse","HEAD")!==expected||git(root,"status","--porcelain")!=="")
    throw Error("T06 bloqueado: el worktree no coincide con el candidato");
  }
  prepared=true;
  const intents=definitions.map((item,i)=>({
   taskId:"t06-writer-"+item.suffix,sessionId:"t06-child-"+randomUUID(),
   candidateSha:expected,model,writeSurface:item.target,
   nonce:randomBytes(8).toString("hex")
  }));
  const reader=createInterface({input:process.stdin,output:process.stdout});
  let replies:string[]=[];
  try{
   for(let i=0;i<intents.length;i++){
    const task=intents[i]!,root=roots[i]!,spec=definitions[i]!;
    process.stdout.write("\nWorker "+(i+1)+"/2 · Modelo: "+model+
     " · Coste real: DESCONOCIDO · Archivo: "+task.writeSurface+
     " · SHA: "+expected+"\n"+
     "Sesión Pi propia, worktree separado. Tarea: "+spec.instruction+"\n"+
     "No habrá commits, fusiones ni reintentos automáticos.\n");
    replies.push(await reader.question("Escribe EXACTAMENTE «"+t06LiveApprovalChallenge(task)+"» o pulsa Intro para denegar: "));
   }
  }finally{reader.close();}
  requireDistinctT06Approvals(intents[0]!,replies[0],intents[1]!,replies[1]);
  replies=[];launched=true;
  const results=await Promise.allSettled(definitions.map((item,i)=>
   nativeWriter(roots[i]!,intents[i]!,item.fn,item.instruction,policyRoot)
  ));
  const workers=results.map((outcome,i)=>outcome.status==="fulfilled"?outcome.value:{
   worker:intents[i]!.taskId,scope:intents[i]!.writeSurface,
   passed:false,error:"Worker failed ambiguously; inspect its worktree and Pi process; do not retry"
  });
  const passed=results.every(r=>r.status==="fulfilled"&&r.value.passed);
  const intervals=results.flatMap(r=>r.status==="fulfilled"?[r.value]:[]);
  const concurrent=intervals.length===2&&intervals.every(r=>r.startedAt!==null&&r.endedAt!==null)&&
   Math.max(...intervals.map(r=>r.startedAt!))<Math.min(...intervals.map(r=>r.endedAt!));
  const review=passed&&concurrent?
   await runT06NativeIndependentReviews(roots,policyRoot,model):
   {status:"NOT_RUN_WRITERS_UNVERIFIED" as const,reviews:[]};
  const evidence={
   schema:"asen.t06.native-dual-writer/v1",sha:expected,piVersion:version,
   executionKind:"NATIVE_PI_RPC_WRITER_WITH_TWO_MANUAL_TERMINAL_APPROVALS",
   consentMethod:"two-distinct-interactive-parent-terminal-prompts-not-native-pi-TUI",
   requestedModel:model,modelCostVerified:false,billingVerified:false,
   distinctWorktrees:true,distinctSessions:true,concurrent,
   workers:workers.map(r=>{
    const {startedAt:_start,endedAt:_end,...safe}=r;
    return safe;
   }),
   independentReview:review,autoRetry:false,autoMerge:false,
   accepted:false,globalFull:false,
   result:passed&&concurrent?
    (review.status==="PASS_TWO_PI_REVIEWS_NOT_T10"?
     "PASS_TWO_REAL_WRITERS_AND_PI_REVIEWS_NEEDS_T10":
     "PASS_TWO_REAL_WRITERS_NEEDS_INDEPENDENT_REVIEW"):
    "BLOCKED_OR_PARTIAL_NEEDS_REVIEW"
  };
  const file=join(dir,"t06-dual-native-evidence.json");
  writeFileSync(file,JSON.stringify(evidence,null,2)+"\n",{mode:0o600,flag:"wx"});
  process.stdout.write(JSON.stringify({result:evidence.result,sha:expected,report:file,
   independentReview:review.status,worktreeRoots:roots})+"\n");
  if(!passed||!concurrent||
   review.status==="REVIEW_FAILED_OR_UNVERIFIED"||
   review.status==="REVIEW_DECLINED_NO_RETRY")process.exitCode=1;
 }finally{
  // Un intento de Writer que ha arrancado puede haber dejado efectos
  // ambiguos: no eliminar los worktrees ni reintentar automáticamente.
  if(!launched){
   for(const root of roots){
    try{execFileSync("git",["-C",policyRoot,"worktree","remove","--force",root],{stdio:"ignore"});}catch{
     if(!prepared)try{rmSync(root,{recursive:true,force:true});}catch{}
    }
   }
  }
 }
}
await main();
