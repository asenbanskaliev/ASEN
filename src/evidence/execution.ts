import {spawn,execFileSync,type ChildProcess} from "node:child_process";
import {realpathSync} from "node:fs";
import {mkdtemp,mkdir,open,readdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {isAbsolute,join,relative} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {spawnContained} from "./spawn-contained.js";
import {isolatedGitEnvironment,checkoutEolSettings} from "../runtime/agents/git-isolated-environment.js";
import {validatePortableReviewPaths} from "../review/review-tree-paths.js";
import type {Candidate,Evidence} from "../core/types.js";
import type {EvidenceStore} from "./store.js";

export interface ExecutedEvidence {
 readonly candidateRepository:string;
 readonly candidateId:string;
 readonly candidateRevision:string;
 readonly command:readonly string[];
 readonly cwd:string;
 readonly exitCode:number;
 readonly startedAt:string;
 readonly finishedAt:string;
}
const executed=new WeakSet<object>();

function canonicalizeCoverageUrls(document:unknown,coverageRoot:string):unknown{
 if(typeof document!=="object"||document===null||!Array.isArray((document as {result?:unknown}).result))return document;
 const result=(document as {result:unknown[]}).result.map(script=>{
  if(typeof script!=="object"||script===null||typeof (script as {url?:unknown}).url!=="string"||!(script as {url:string}).url.startsWith("file:"))return script;
  let absolute:string;try{absolute=fileURLToPath((script as {url:string}).url);}catch{return script;}
  let canonical:string;try{canonical=realpathSync(absolute);}catch(error){const code=(error as NodeJS.ErrnoException).code,relativePath=relative(coverageRoot,absolute).replace(/\\/gu,"/"),outside=isAbsolute(relativePath)||relativePath===".."||relativePath.startsWith("../");if((code==="ENOENT"||code==="ENOTDIR")&&outside)return script;throw new Error("Node coverage script path could not be canonicalized");}
  return {...script,url:pathToFileURL(canonical).href};
 });
 return {...document,result};
}

function waitForProcessExit(child:ChildProcess):Promise<void>{
 if(child.exitCode!==null||child.signalCode!==null)return Promise.resolve();
 return new Promise(resolve=>{
  const done=()=>{child.removeListener("close",done);child.removeListener("error",done);resolve();};
  child.once("close",done);child.once("error",done);
 });
}

async function terminateProcessTree(child:ChildProcess):Promise<void>{
 if(!child.pid)return;
 const exited=waitForProcessExit(child);
 if(process.platform==="win32"){
  await new Promise<void>(resolve=>{
   const killer=spawn("taskkill",["/pid",String(child.pid),"/T","/F"],{stdio:"ignore",windowsHide:true});
   killer.once("error",()=>{child.kill("SIGKILL");resolve();});
   killer.once("close",code=>{if(code!==0)child.kill("SIGKILL");resolve();});
  });
 }else{
  try{process.kill(-child.pid,"SIGKILL");}catch{child.kill("SIGKILL");}
 }
 await exited;
}

type FrozenExecution=Readonly<{baseRevision:string;tree:string;testPaths:readonly string[];signal?:AbortSignal}>;
// Node 22 conserva el nombre experimental; desde 23.6 se usa el nuevo.
const [nodeMajor,nodeMinor]=process.versions.node.split(".").map(Number);
const testIsolationFlag=nodeMajor===22||nodeMajor===23&&(nodeMinor??0)<6?"--experimental-test-isolation=none":"--test-isolation=none";
function frozenGit(cwd:string,args:readonly string[],hooks:string,eol:readonly string[]=["-c","core.autocrlf=false","-c","core.eol=lf"]):string{
 return execFileSync("git",["--no-replace-objects","-c","core.fsmonitor=false","-c","core.hooksPath="+hooks,
 ...eol,"-c","gc.auto=0","-c","maintenance.auto=false","-C",cwd,...args],
 {env:isolatedGitEnvironment(),encoding:"utf8",stdio:["ignore","pipe","ignore"],maxBuffer:16*1024*1024,timeout:15000,windowsHide:true});
}
export function assertExactGitCandidate(candidate:Candidate,cwd:string,hooks?:string,eol?:readonly string[]):void{
 const run=(...args:string[])=>hooks?frozenGit(cwd,args,hooks,eol).trim():execFileSync("git",["-C",cwd,...args],{encoding:"utf8",stdio:["ignore","pipe","ignore"],maxBuffer:16*1024*1024}).trim();
 let prefix:string,head:string;
 try{prefix=run("rev-parse","--show-prefix");head=run("rev-parse","HEAD");}
 catch{throw new Error("Execution evidence requires a Git repository with a checked-out HEAD");}
 if(prefix!==""||realpathSync(cwd)!==realpathSync(candidate.repository))throw new Error("Execution evidence repository mismatch");
 if(head!==candidate.revision)throw new Error("Execution evidence revision mismatch");
 let untracked:string;
 try{untracked=run("ls-files","--others","--exclude-standard");}
 catch(error){throw new Error(`Execution evidence could not inspect untracked Git files: ${error instanceof Error?error.message:String(error)}`);}
 if(untracked!=="")throw new Error(`Execution evidence requires no untracked Git files: ${untracked.split("\n").slice(0,20).join(", ")}${untracked.split("\n").length>20?" …":""}`);
 // HEAD alone does not identify the bytes executed from a modified checkout.
 try{if(hooks)frozenGit(cwd,["diff","--quiet","--no-ext-diff","--no-textconv","HEAD","--"],hooks,eol);else execFileSync("git",["-C",cwd,"diff","--quiet","HEAD","--"],{stdio:"ignore"});}
 catch{throw new Error("Execution evidence requires unchanged tracked files at the candidate revision");}
}

export function isExecutedEvidence(value:unknown):value is ExecutedEvidence {
 return typeof value==="object"&&value!==null&&executed.has(value);
}

type CapturedExecution={readonly proof:ExecutedEvidence;readonly stdout:string;readonly stderr:string};
type CoverageExecution=CapturedExecution&{readonly coverage:readonly unknown[];readonly coverageRoot:string};
async function readBoundedCoverageFile(filePath:string,remaining:number):Promise<Buffer>{
 const handle=await open(filePath,"r");
 try{
  const stat=await handle.stat();
  if(!stat.isFile()||!Number.isSafeInteger(stat.size)||stat.size<0||stat.size>remaining)throw new Error("Node coverage output exceeded its limit");
  const bytes=Buffer.alloc(Math.min(remaining+1,stat.size+1));let offset=0;
  while(offset<bytes.length){const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);if(!bytesRead)break;offset+=bytesRead;}
  if(offset>remaining)throw new Error("Node coverage output exceeded its limit");
  if(offset!==stat.size)throw new Error("Node coverage output changed while reading");
  const verified=await handle.stat();
  if(!verified.isFile()||verified.size!==stat.size)throw new Error("Node coverage output changed while reading");
  return bytes.subarray(0,offset);
 }finally{await handle.close();}
}
async function runEvidenceCommand(candidate:Candidate,command:readonly [string,...string[]],options:{cwd?:string;timeoutMs?:number;frozen?:FrozenExecution},capture:boolean,coverage=false):Promise<CapturedExecution|CoverageExecution>{
 if(!candidate.repository||!candidate.id||!candidate.revision)throw new Error("Execution evidence requires exact candidate identity");
 const requestedCwd=options.cwd??candidate.repository;
 const frozen=options.frozen;
 if(!frozen)assertExactGitCandidate(candidate,requestedCwd);
 const parent=await mkdtemp(join(tmpdir(),"asen-evidence-worktree-")),isolated=join(parent,"candidate"),hooks=join(parent,"hooks");
 let created=false;
 let sourceEol:readonly string[]|undefined;
 const rejectExternalConfig=()=>{
  try{
   if(frozenGit(requestedCwd,["config","--get-regexp","^(filter\\.|merge\\..*\\.driver$|diff\\..*\\.command$|core\\.sshcommand$)"],hooks).trim())
    throw Error("Configuración Git externa no admitida para estas pruebas");
  }catch(error){if((error as {status?:number})?.status!==1)throw error;}
 };
 const assertSource=()=>{
  if(!frozen)return assertExactGitCandidate(candidate,requestedCwd);
  if(frozen.signal?.aborted)throw Error("Pruebas canceladas");
  rejectExternalConfig();
  assertExactGitCandidate({...candidate,revision:frozen.baseRevision},requestedCwd,hooks,sourceEol);
  if(frozenGit(requestedCwd,["rev-parse",candidate.revision+"^{tree}"],hooks).trim()!==frozen.tree||
     frozenGit(requestedCwd,["rev-parse",candidate.revision+"^"],hooks).trim()!==frozen.baseRevision)
   throw Error("El candidato congelado cambió");
 };
 try{
  if(frozen){
   if(!/^[a-f0-9]{40}$/u.test(candidate.revision)||! /^[a-f0-9]{40}$/u.test(frozen.baseRevision)||! /^[a-f0-9]{40}$/u.test(frozen.tree))
    throw Error("Las pruebas congeladas requieren objetos Git SHA-1 exactos");
   await mkdir(hooks);
   // Consultar configuración de finales de línea del checkout original, sin usarla en el checkout temporal.
   sourceEol=checkoutEolSettings(requestedCwd).args;
   assertSource();
   const entries=frozenGit(requestedCwd,["ls-tree","-r","-z",frozen.tree],hooks).split("\0").filter(Boolean).map(line=>{
    const match=/^(100644|100755) blob [a-f0-9]{40}\t(.+)$/u.exec(line);
    if(!match)throw Error("Las pruebas congeladas no admiten enlaces, submódulos o rutas no portables");
    return match[2]!;
   });
   validatePortableReviewPaths(entries);
   if(frozen.testPaths.some(path=>!entries.includes(path)))throw Error("Una prueba seleccionada no existe en el árbol exacto");
   frozenGit(requestedCwd,["worktree","add","--detach",isolated,candidate.revision],hooks);
   created=true;
  }else{
   execFileSync("git",["-C",candidate.repository,"worktree","add","--detach",isolated,candidate.revision],{stdio:"ignore"});
   created=true;
  }
  assertExactGitCandidate({...candidate,repository:isolated},isolated,frozen?hooks:undefined);
  const coverageRoot=realpathSync(isolated);
  if(frozen&&frozenGit(isolated,["rev-parse","HEAD^{tree}"],hooks).trim()!==frozen.tree)throw Error("El árbol materializado no coincide");
  const startedAt=new Date().toISOString(),stdout:Buffer[]=[],stderr:Buffer[]=[],limit=1024*1024,coverageDirectory=join(parent,"coverage");
  if(coverage)await mkdir(coverageDirectory);
  const actualArgs=frozen?["--permission","--allow-fs-read="+coverageRoot,"--test",testIsolationFlag,"--test-reporter=tap","--",...frozen.testPaths.map(path=>"./"+path)]:command.slice(1);
  const exitCode=await new Promise<number>((resolve,reject)=>{
   // La prueba explícitamente autorizada ejecuta Node sin claves, HOME, PATH,
   // NODE_OPTIONS ni configuración heredada. La restricción de Node reduce
   // accesos accidentales; NO es una barrera frente a código hostil.
   const env=frozen?Object.fromEntries(["SystemRoot","SYSTEMROOT","WINDIR"].flatMap(key=>process.env[key]===undefined?[]:[[key,process.env[key]]])):
    capture?{...process.env,NODE_TEST_CONTEXT:undefined,...(coverage?{NODE_V8_COVERAGE:coverageDirectory}:{})}:undefined;
   if(frozen?.signal?.aborted){reject(Error("Pruebas canceladas"));return;}
   const child=spawnContained(command[0],actualArgs,{cwd:isolated,stdio:capture?["ignore","pipe","pipe"]:"ignore",shell:false,detached:process.platform!=="win32",env});
   let stopped=false,size=0,timer:NodeJS.Timeout;
   const abort=()=>fail(Error("Pruebas canceladas"));
   const fail=(error:Error)=>{if(stopped)return;stopped=true;if(timer)clearTimeout(timer);frozen?.signal?.removeEventListener("abort",abort);void terminateProcessTree(child).finally(()=>reject(error));};
   const collect=(target:Buffer[])=>(chunk:Buffer)=>{size+=chunk.length;if(size>limit)fail(new Error("Execution evidence output exceeded its limit"));else target.push(chunk);};
   if(capture){child.stdout?.on("data",collect(stdout));child.stderr?.on("data",collect(stderr));}
   timer=setTimeout(()=>fail(new Error("Execution evidence command timed out")),options.timeoutMs??120000);
   child.on("error",error=>fail(error));
   child.on("close",code=>{clearTimeout(timer);frozen?.signal?.removeEventListener("abort",abort);if(!stopped){stopped=true;resolve(code??-1);}});
   frozen?.signal?.addEventListener("abort",abort,{once:true});if(frozen?.signal?.aborted)abort();
  });
  assertExactGitCandidate({...candidate,repository:isolated},isolated,frozen?hooks:undefined);assertSource();
  const proof=Object.freeze({candidateRepository:candidate.repository,candidateId:candidate.id,candidateRevision:candidate.revision,command:Object.freeze([command[0],...actualArgs]),cwd:isolated,exitCode,startedAt,finishedAt:new Date().toISOString()});
  executed.add(proof);const result={proof,stdout:Buffer.concat(stdout).toString("utf8"),stderr:Buffer.concat(stderr).toString("utf8")};
  if(!coverage)return Object.freeze(result);
  const names=(await readdir(coverageDirectory)).sort();if(!names.length||names.some(name=>!/^coverage-\d+-\d+-\d+\.json$/u.test(name)))throw new Error("Node coverage output is missing or ambiguous");
  const coverageLimit=8*1024*1024;let size=0;const documents:unknown[]=[];for(const name of names){const bytes=await readBoundedCoverageFile(join(coverageDirectory,name),coverageLimit-size);size+=bytes.length;try{documents.push(canonicalizeCoverageUrls(JSON.parse(bytes.toString("utf8")),coverageRoot));}catch(error){if(error instanceof SyntaxError)throw new Error("Node coverage output is malformed");throw error;}}
  return Object.freeze({...result,coverage:Object.freeze(documents),coverageRoot});
 }finally{
  try{if(created){if(frozen)frozenGit(candidate.repository,["worktree","remove","--force",isolated],hooks);else execFileSync("git",["-C",candidate.repository,"worktree","remove","--force",isolated],{stdio:"ignore"});}}
  catch{/* Recursive parent cleanup below remains authoritative. */}
  await rm(parent,{recursive:true,force:true});
 }
}
export function executeEvidenceCommand(candidate:Candidate,command:readonly [string,...string[]],options:{cwd?:string;timeoutMs?:number}={}):Promise<ExecutedEvidence>{
 return runEvidenceCommand(candidate,command,options,false).then(result=>result.proof);
}
/** Internal-facing bounded capture for parsers that issue stronger structured evidence. */
export function executeCapturedEvidenceCommand(candidate:Candidate,command:readonly [string,...string[]],options:{cwd?:string;timeoutMs?:number}={}):Promise<CapturedExecution>{
 return runEvidenceCommand(candidate,command,options,true) as Promise<CapturedExecution>;
}
/** Internal structured capture; coverage bytes never cross this boundary. */
/** Adaptador fijo para la prueba Node autorizada del candidato aún no integrado. */
export function executeFrozenNodeEvidence(candidate:Candidate,frozen:FrozenExecution):Promise<CapturedExecution>{
 const command=[process.execPath,"--permission","--test",testIsolationFlag,"--test-reporter=tap","--",...frozen.testPaths] as [string,...string[]];
 return runEvidenceCommand(candidate,command,{cwd:candidate.repository,timeoutMs:120000,frozen},true) as Promise<CapturedExecution>;
}
export function executeNodeCoverageCommand(candidate:Candidate,command:readonly [string,...string[]],options:{cwd?:string;timeoutMs?:number}={}):Promise<CoverageExecution>{
 return runEvidenceCommand(candidate,command,options,true,true) as Promise<CoverageExecution>;
}

export function addExecutedEvidence(store:EvidenceStore,candidate:Candidate,proof:ExecutedEvidence,evidence:{id:string;kind:"test"|"tdd";summary:string;expectFailure?:boolean}):Evidence{
 if(!isExecutedEvidence(proof))throw new Error("Execution evidence requires ASEN-issued execution proof");
 if(proof.candidateRepository!==candidate.repository||proof.candidateId!==candidate.id||proof.candidateRevision!==candidate.revision)throw new Error("Execution proof candidate mismatch");
 const expectedFailure=evidence.expectFailure===true;
 if(expectedFailure?proof.exitCode===0:proof.exitCode!==0)throw new Error(expectedFailure?"Expected failing execution did not fail":"Passing execution evidence requires exit code 0");
 return store.addExecuted(candidate,proof,{id:evidence.id,kind:evidence.kind,status:expectedFailure?"expected-fail":"pass",summary:evidence.summary,createdAt:proof.finishedAt});
}
