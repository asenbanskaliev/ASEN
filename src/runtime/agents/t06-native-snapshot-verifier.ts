/** T06/T10 — comprobación local de un informe Pi Writer frente a DOS
 * worktrees Git conservados. Solo lectura. NO acredita el modelo, el
 * consentimiento humano, las pruebas de comportamiento ni una revisión T10. */
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {lstatSync,readFileSync,realpathSync} from "node:fs";
import {join,relative} from "node:path";

export interface T06NativeSnapshotVerification{
 readonly status:"blocked"|"local-files-consistent-claims-unverified";
 readonly blockers:readonly string[];
 readonly locallyMatchedFiles:number;
 readonly humanConsentVerified:false;
 readonly actualProviderVerified:false;
 readonly behaviorRetested:false;
 readonly independentReviewVerified:false;
 readonly billingVerified:false;
 readonly acceptance:"not-accepted";
 readonly globalFull:false;
}
type Data=Record<string,unknown>;
const object=(value:unknown):value is Data=>
 typeof value==="object"&&value!==null&&!Array.isArray(value)&&
 Object.getPrototypeOf(value)===Object.prototype;
const sha=/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const digest=/^[a-f0-9]{64}$/u;
const model=/^nvidia\/[A-Za-z0-9._-]{3,100}$/u;
const scopes=["t06-writer-a.mjs","t06-writer-b.mjs"] as const;
const workerIds=["t06-writer-a","t06-writer-b"] as const;
const manualConsentMethod="two-distinct-interactive-parent-terminal-prompts-not-native-pi-TUI";
const githubConsentMethod="two-distinct-github-environment-human-approvals-not-native-pi-TUI";
const validProvenance=(kind:unknown,method:unknown):boolean=>
 kind==="NATIVE_PI_RPC_WRITER_WITH_TWO_MANUAL_TERMINAL_APPROVALS"&&
 method===manualConsentMethod||
 kind==="NATIVE_PI_RPC_WRITER_WITH_TWO_GITHUB_APPROVALS"&&
 method===githubConsentMethod;
const git=(root:string,...args:string[])=>execFileSync("git",["-C",root,...args],{
 encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:12_000,maxBuffer:200_000
}).trim();
const hash=(data:Buffer)=>createHash("sha256").update(data).digest("hex");

/** Comprueba únicamente un informe ya existente y el contenido Git local.
 * Un resultado consistente indica coincidencia de archivos, no veracidad de
 * los avisos del proceso Pi: esos hechos necesitan fuentes independientes. */
export function verifyT06NativeSnapshot(input:{
 readonly report:unknown;
 readonly worktreeRoots:readonly string[];
}):T06NativeSnapshotVerification{
 const problems:string[]=[];
 let matched=0;
 const stop=(reason:string)=>{if(!problems.includes(reason))problems.push(reason);};
 const source:unknown=input?.report;
 const report:Data=object(source)?source:{};
 if(!object(source)||report.schema!=="asen.t06.native-dual-writer/v1"||
  !sha.test(String(report.sha??""))||!model.test(String(report.requestedModel??""))||
  !validProvenance(report.executionKind,report.consentMethod)||
  report.autoRetry!==false||report.autoMerge!==false||
  report.accepted!==false||report.globalFull!==false||
  report.modelCostVerified!==false||report.billingVerified!==false||
  report.distinctWorktrees!==true||report.distinctSessions!==true||
  report.concurrent!==true||
  !["PASS_TWO_REAL_WRITERS_NEEDS_INDEPENDENT_REVIEW",
    "PASS_TWO_REAL_WRITERS_AND_PI_REVIEWS_NEEDS_T10"].includes(String(report.result)))
  stop("Informe sin procedencia, integridad de estados o resultado válido");
 if(!Array.isArray(input?.worktreeRoots)||input.worktreeRoots.length!==2||
  !input.worktreeRoots.every(x=>typeof x==="string"&&x.length>0))
  stop("Se requieren exactamente dos directorios Git distintos");
 const workers=object(report)&&Array.isArray(report.workers)?report.workers:[];
 if(workers.length!==2)stop("El informe no contiene exactamente dos Workers");
 const sessions=new Set<string>();
 const roots=new Set<string>();
 for(let i=0;i<2;i++){
  const row=workers[i],expectedScope=scopes[i]!,expectedWorker=workerIds[i]!;
  if(!object(row)||row.worker!==expectedWorker||row.scope!==expectedScope||
   typeof row.session!=="string"||!/^t06-child-[a-f0-9-]{36}$/u.test(row.session)||
   row.requestedModel!==report?.requestedModel||
   row.observedModel!==report?.requestedModel||
   row.processObserved!==true||row.writeToolObserved!==true||
   row.nativeResultOk!==true||row.exactScope!==true||
   row.syntaxOk!==true||row.behaviorOk!==true||row.passed!==true||
   !Number.isSafeInteger(row.durationMs)||!(Number(row.durationMs)>0)||
   !digest.test(String(row.fileSha256??""))){
   stop("Worker "+(i+1)+": datos declarados incompletos o incompatibles");
   continue;
  }
  if(sessions.has(row.session))stop("Sesión Pi repetida");
  sessions.add(row.session);
  const supplied=input.worktreeRoots?.[i];
  if(typeof supplied!=="string"||supplied.length===0)continue;
  try{
   const root=realpathSync(supplied);
   if(!lstatSync(supplied).isDirectory()||roots.has(root))
    throw new Error("Root repeated or not a directory");
   roots.add(root);
   const top=realpathSync(git(root,"rev-parse","--show-toplevel"));
   if(top!==root||git(root,"rev-parse","HEAD")!==report.sha)
    throw new Error("Root and SHA do not match");
   const changes=git(root,"status","--porcelain=v1","--untracked-files=all")
    .split(/\r?\n/u).filter(Boolean);
   if(changes.length!==1||changes[0]!==("?? "+expectedScope))
    throw new Error("Unexpected Git changes");
   if(git(root,"ls-tree","--name-only","HEAD","--",expectedScope)!=="")
    throw new Error("File existed in the base commit");
   const filepath=join(root,expectedScope);
   const info=lstatSync(filepath);
   if(!info.isFile()||info.isSymbolicLink()||
    relative(root,realpathSync(filepath))!==expectedScope)
    throw new Error("Unsafe file path");
   if(hash(readFileSync(filepath))!==row.fileSha256)
    throw new Error("File hash does not match");
   matched++;
  }catch{
   stop("Worker "+(i+1)+": Git, archivo o huella distinta del informe");
  }
 }
 if(roots.size!==2)stop("No se han verificado dos worktrees diferentes");
 if(sessions.size!==2)stop("No se han verificado dos sesiones Pi diferentes");
 return Object.freeze({
  status:problems.length?"blocked" as const:
   "local-files-consistent-claims-unverified" as const,
  blockers:Object.freeze(problems),
  locallyMatchedFiles:matched,
  humanConsentVerified:false as const,actualProviderVerified:false as const,
  behaviorRetested:false as const,independentReviewVerified:false as const,
  billingVerified:false as const,acceptance:"not-accepted" as const,
  globalFull:false as const
 });
}
