import {spawn,execFileSync,type ChildProcess} from "node:child_process";
import {realpathSync} from "node:fs";
import {mkdtemp,mkdir,open,readdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {isAbsolute,join,relative} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {spawnContained} from "./spawn-contained.js";
import type {Candidate,Evidence} from "../core/types.js";
import {EvidenceStore} from "./store.js";

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

export function assertExactGitCandidate(candidate:Candidate,cwd:string):void{
 const run=(...args:string[])=>execFileSync("git",["-C",cwd,...args],{encoding:"utf8",stdio:["ignore","pipe","ignore"],maxBuffer:16*1024*1024}).trim();
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
 try{execFileSync("git",["-C",cwd,"diff","--quiet","HEAD","--"],{stdio:"ignore"});}
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
async function runEvidenceCommand(candidate:Candidate,command:readonly [string,...string[]],options:{cwd?:string;timeoutMs?:number},capture:boolean,coverage=false):Promise<CapturedExecution|CoverageExecution>{
 if(!candidate.repository||!candidate.id||!candidate.revision)throw new Error("Execution evidence requires exact candidate identity");
 const requestedCwd=options.cwd??candidate.repository;
 assertExactGitCandidate(candidate,requestedCwd);
 const parent=await mkdtemp(join(tmpdir(),"asen-evidence-worktree-")),isolated=join(parent,"candidate");
 try{
  execFileSync("git",["-C",candidate.repository,"worktree","add","--detach",isolated,candidate.revision],{stdio:"ignore"});
  assertExactGitCandidate({...candidate,repository:isolated},isolated);const coverageRoot=realpathSync(isolated);
  const startedAt=new Date().toISOString(),stdout:Buffer[]=[],stderr:Buffer[]=[],limit=1024*1024,coverageDirectory=join(parent,"coverage");
  if(coverage)await mkdir(coverageDirectory);
  const exitCode=await new Promise<number>((resolve,reject)=>{
   const env=capture?{...process.env,NODE_TEST_CONTEXT:undefined,...(coverage?{NODE_V8_COVERAGE:coverageDirectory}:{})}:undefined;
   const child=spawnContained(command[0],command.slice(1),{cwd:isolated,stdio:capture?["ignore","pipe","pipe"]:"ignore",shell:false,detached:process.platform!=="win32",env});
   let stopped=false,size=0,timer:NodeJS.Timeout;
   const fail=(error:Error)=>{if(stopped)return;stopped=true;if(timer)clearTimeout(timer);void terminateProcessTree(child).finally(()=>reject(error));};
   const collect=(target:Buffer[])=>(chunk:Buffer)=>{size+=chunk.length;if(size>limit)fail(new Error("Execution evidence output exceeded its limit"));else target.push(chunk);};
   if(capture){child.stdout?.on("data",collect(stdout));child.stderr?.on("data",collect(stderr));}
   timer=setTimeout(()=>fail(new Error("Execution evidence command timed out")),options.timeoutMs??120000);
   child.on("error",error=>fail(error));
   child.on("close",code=>{clearTimeout(timer);if(!stopped){stopped=true;resolve(code??-1);}});
  });
  assertExactGitCandidate({...candidate,repository:isolated},isolated);assertExactGitCandidate(candidate,requestedCwd);
  const proof=Object.freeze({candidateRepository:candidate.repository,candidateId:candidate.id,candidateRevision:candidate.revision,command:Object.freeze([...command]),cwd:isolated,exitCode,startedAt,finishedAt:new Date().toISOString()});
  executed.add(proof);const result={proof,stdout:Buffer.concat(stdout).toString("utf8"),stderr:Buffer.concat(stderr).toString("utf8")};
  if(!coverage)return Object.freeze(result);
  const names=(await readdir(coverageDirectory)).sort();if(!names.length||names.some(name=>!/^coverage-\d+-\d+-\d+\.json$/u.test(name)))throw new Error("Node coverage output is missing or ambiguous");
  const coverageLimit=8*1024*1024;let size=0;const documents:unknown[]=[];for(const name of names){const bytes=await readBoundedCoverageFile(join(coverageDirectory,name),coverageLimit-size);size+=bytes.length;try{documents.push(canonicalizeCoverageUrls(JSON.parse(bytes.toString("utf8")),coverageRoot));}catch(error){if(error instanceof SyntaxError)throw new Error("Node coverage output is malformed");throw error;}}
  return Object.freeze({...result,coverage:Object.freeze(documents),coverageRoot});
 }finally{
  try{execFileSync("git",["-C",candidate.repository,"worktree","remove","--force",isolated],{stdio:"ignore"});}
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
