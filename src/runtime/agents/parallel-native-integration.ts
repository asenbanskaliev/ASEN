/** Composición de resultados ODD por objetos Git inmutables. El candidato no
 * modifica el checkout, el índice real, la rama ni los permisos de Writer. */
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {isolatedGitEnvironment} from "./git-isolated-environment.js";
import {sameWorkspaceIdentityPath} from "../workspace-store.js";
import {validatePortableReviewPaths} from "../../review/review-tree-paths.js";
import {hasSensitiveName} from "../../security/primary-tool-policy.js";
import type {TodoContext} from "../lifecycle/todo-store.js";
import type {ParallelTodoWorktreeJournal} from "./parallel-todo-journal.js";
import type {ParallelChildSessionJournal} from "./parallel-todo-session-links.js";
import type {ParallelWorkerObservationJournal} from "./parallel-worker-observation-journal.js";

const oid=/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const equal=(a:readonly string[],b:readonly string[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
function git(root:string,args:readonly string[],input?:Buffer,index?:string,identity?:NodeJS.ProcessEnv):Buffer{
 return execFileSync("git",["--no-replace-objects","--no-pager","-c","core.fsmonitor=false",
  "-c","diff.external=","-c","commit.gpgSign=false","-c","gc.auto=0","-c","maintenance.auto=false","-C",root,...args],{
  env:{...isolatedGitEnvironment(identity),...(index?{GIT_INDEX_FILE:index}:{})},input,
  stdio:[input===undefined?"ignore":"pipe","pipe","pipe"],timeout:15000,maxBuffer:16*1024*1024,windowsHide:true});
}
const txt=(root:string,args:readonly string[],index?:string)=>git(root,args,undefined,index).toString("utf8").trim();
const records=(data:Buffer)=>new TextDecoder("utf-8",{fatal:true}).decode(data).split("\0").filter(Boolean);
const changed=(root:string,base:string,tree:string)=>records(git(root,["diff-tree","-r","--name-only","--no-renames","--no-commit-id","-z",base,tree]));
export interface NativeIntegrationCandidate{
 readonly batchId:string;readonly repository:string;readonly baseCommit:string;readonly tree:string;readonly commit:string;
 readonly paths:readonly string[];readonly sourceTodoIds:readonly string[];
 readonly acceptance:"not-accepted";readonly review:"required";readonly verification:"required";readonly autoMerge:false;readonly writerAuthority:false;
}
export interface NativeIntegrationInput{
 readonly identity:TodoContext;readonly batchId:string;
 readonly sourceJournal:ParallelTodoWorktreeJournal;readonly sessionJournal:ParallelChildSessionJournal;
 readonly observations:ParallelWorkerObservationJournal;
}
export async function buildNativeIntegrationCandidate(input:NativeIntegrationInput):Promise<NativeIntegrationCandidate>{
 const {identity,batchId}=input;
 const root=realpathSync(identity.projectId);
 if(!sameWorkspaceIdentityPath(root,identity.projectId)||!sameWorkspaceIdentityPath(realpathSync(txt(root,["rev-parse","--show-toplevel"])),root))
  throw new Error("Integration requires the original canonical Git root");
 const batch=(await input.sourceJournal.list(identity)).find(row=>row.id===batchId);
 if(!batch||batch.state!=="prepared"||batch.tasks.length!==2||!oid.test(batch.sourceHead))
  throw new Error("Integration requires one prepared native partition");
 const links=(await input.sessionJournal.listSource(identity)).filter(link=>link.batchId===batchId);
 const receipts=(await input.observations.listSource(identity,links)).filter(row=>row.batchId===batchId);
 if(links.length!==2||receipts.length!==2)throw new Error("Both exact native terminal receipts are required");
 const baseTree=txt(root,["rev-parse","--verify",batch.sourceHead+"^{tree}"]);
 if(!oid.test(baseTree))throw new Error("Invalid integration base");
 const allPaths:string[]=[], additions:Buffer[]=[],removals:Buffer[]=[];
 for(const task of batch.tasks){
  const link=links.find(row=>row.sourceTodoId===task.taskId),receipt=receipts.find(row=>row.sourceTodoId===task.taskId);
  if(!link?.nativeSessionFile||!receipt?.candidateTree||!oid.test(receipt.candidateTree)||receipt.agentState!=="completed"||
   receipt.childTodoState!=="succeeded"||receipt.worktreeChangeState!=="scoped-changes"||
   receipt.sourceTodoRevision!==task.taskRevision||link.sourceHead!==batch.sourceHead||
   link.sourceRequestId!==task.requestId||receipt.childSessionId!==link.childSessionId||
   !sameWorkspaceIdentityPath(receipt.childProjectId,task.worktreeRoot))
   throw new Error("Worker result is missing a complete, scoped immutable tree");
  if(txt(root,["cat-file","-t",receipt.candidateTree])!=="tree")throw new Error("Worker tree object is unavailable");
  const paths=changed(root,baseTree,receipt.candidateTree);
  if(!paths.length||!equal(paths,receipt.changedPaths)||paths.some(path=>
   hasSensitiveName(path)||path.split("/").some(part=>/[. ]$/u.test(part))||
   !task.writeSurfaces.some(scope=>path===scope||path.startsWith(scope+"/"))))
   throw new Error("Worker tree differs from the exact observed scope");
  allPaths.push(...paths);
  // Cada cambio se incorpora como objeto, no como comando del modelo.
  // Rechazar enlaces, submódulos y cambios ambiguos de tipo.
  const entries=new Map(records(git(root,["ls-tree","-r","-z",receipt.candidateTree])).map(line=>{
   const tab=line.indexOf("\t");return [line.slice(tab+1),line.slice(0,tab)] as const;
  }));
  for(const path of paths){
   const metadata=entries.get(path);
   removals.push(Buffer.from("0 "+"0".repeat(baseTree.length)+"\t"+path+"\0"));
   if(metadata){
    const match=/^(100644|100755) blob ([a-f0-9]{40}(?:[a-f0-9]{24})?)$/u.exec(metadata);
    if(!match)throw new Error("Integration accepts regular file blobs only");
    additions.push(Buffer.from(match[1]+" "+match[2]+"\t"+path+"\0"));
   }
  }
 }
 if(new Set(allPaths.map(path=>path.toLowerCase())).size!==allPaths.length)throw new Error("Overlapping Worker result paths");
 validatePortableReviewPaths(allPaths);
 const scratch=mkdtempSync(join(tmpdir(),"asen-native-integration-")),index=join(scratch,"index");
 try{
  git(root,["read-tree",baseTree],undefined,index);
  git(root,["update-index","-z","--index-info"],Buffer.concat(removals),index);
  if(additions.length)git(root,["update-index","-z","--index-info"],Buffer.concat(additions),index);
  const tree=txt(root,["write-tree"],index);
  if(!oid.test(tree)||!equal(changed(root,baseTree,tree),allPaths))throw new Error("Combined integration tree differs from the recorded paths");
  const date=new Date(batch.createdAt).toISOString();
  const commit=git(root,["commit-tree",tree,"-p",batch.sourceHead,"-m","ASEN ODD integration candidate "+batchId],undefined,undefined,{
   GIT_AUTHOR_NAME:"ASEN integration candidate",GIT_AUTHOR_EMAIL:"asen-candidate@example.invalid",
   GIT_COMMITTER_NAME:"ASEN integration candidate",GIT_COMMITTER_EMAIL:"asen-candidate@example.invalid",
   GIT_AUTHOR_DATE:date,GIT_COMMITTER_DATE:date
  }).toString("utf8").trim();
  if(!oid.test(commit)||txt(root,["rev-parse",commit+"^{tree}"])!==tree)throw new Error("Combined candidate commit could not be verified");
  return Object.freeze({batchId,repository:root,baseCommit:batch.sourceHead,tree,commit,
   paths:Object.freeze([...allPaths].sort()),sourceTodoIds:Object.freeze(batch.tasks.map(task=>task.taskId)),
   acceptance:"not-accepted",review:"required",verification:"required",autoMerge:false,writerAuthority:false});
 }finally{rmSync(scratch,{recursive:true,force:true});}
}
