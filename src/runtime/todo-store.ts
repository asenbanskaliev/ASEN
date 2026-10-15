import {createHash,randomUUID} from "node:crypto";
import {chmod,mkdir,readdir,readFile,rename,rm} from "node:fs/promises";
import path from "node:path";
import {atomicWriteText} from "../io/atomic-write.js";
import {withExclusiveFileLock} from "../io/exclusive-file-lock.js";
import {preparePrivateFile} from "../io/private-file.js";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";
import {applyTaskEvent,replayTask,type TaskEvent,type TaskState} from "./task-replay.js";
import type {SkillPhase,SkillSelectionContext} from "../skills/registry.js";
import type {Candidate} from "../core/types.js";

const SCHEMA="asen.todo/v1" as const,MAX_TASKS=2000,MAX_EVENTS=20000;
export type TodoPlanRole="primary"|"explorer"|"worker"|"reviewer"|"verifier"|"clarifier";
export interface TodoPlanMetadata{role:TodoPlanRole;skillPaths:string[];skillSelection?:SkillSelectionContext;priority?:number;candidate?:Candidate;candidateRevision?:string;writeSurfaces?:string[];writerAuthorizationBasis?:string;}
export interface TodoPlanDraft{title:string;requestId:string;dependsOn:readonly string[];description:string;plan:TodoPlanMetadata;}
export interface TodoItem{taskId:string;title:string;events:TaskEvent[];requestId?:string;dependsOn?:string[];description?:string;plan?:TodoPlanMetadata;}
export interface TodoFile{schema:typeof SCHEMA;revision:number;items:TodoItem[];}
export interface TodoContext{sessionId:string;projectId:string;}
const projectKey=(value:string)=>createHash("sha256").update(process.platform==="win32"?value.toLowerCase():value).digest("hex");
const emptyTodoFile=(revision=0):TodoFile=>({schema:SCHEMA,revision,items:[]});
const terminal=(item:TodoItem)=>{const state=replayTask(item.events)?.state;return state==="done"||state==="cancelled";};
const allTerminal=(data:TodoFile)=>data.items.length>0&&data.items.every(terminal);
function throwIfCancelled(signal?:AbortSignal):void{if(signal?.aborted){const error=new Error("Todo update cancelled");error.name="AbortError";throw error;}}
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const identity=(v:unknown)=>typeof v==="string"&&v.length>0&&v.length<=1024&&v===v.trim()&&v===v.normalize("NFC")&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v);
function validPlan(value:unknown):value is TodoPlanMetadata{
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return false;
 const hasSelection=Object.hasOwn(value,"skillSelection"),hasPriority=Object.hasOwn(value,"priority"),hasCandidate=Object.hasOwn(value,"candidate"),hasCandidateRevision=Object.hasOwn(value,"candidateRevision"),hasWriteSurfaces=Object.hasOwn(value,"writeSurfaces"),hasAuthorizationBasis=Object.hasOwn(value,"writerAuthorizationBasis"),keys=["role","skillPaths",...(hasSelection?["skillSelection"]:[]),...(hasPriority?["priority"]:[]),...(hasCandidate?["candidate"]:[]),...(hasCandidateRevision?["candidateRevision"]:[]),...(hasWriteSurfaces?["writeSurfaces"]:[]),...(hasAuthorizationBasis?["writerAuthorizationBasis"]:[])];
 if(!exact(value,keys)||!(["primary","explorer","worker","reviewer","verifier","clarifier"] as unknown[]).includes(value.role)||!Array.isArray(value.skillPaths)||value.skillPaths.some(p=>typeof p!=="string"||!/^skills\/asen-[a-z-]+\/SKILL\.md$/u.test(p))||new Set(value.skillPaths).size!==value.skillPaths.length)return false;
 if(hasPriority&&(!Number.isSafeInteger(value.priority)||Number(value.priority)<1||Number(value.priority)>100))return false;
 if(hasCandidateRevision&&(value.role!=="explorer"||typeof value.candidateRevision!=="string"||!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/iu.test(value.candidateRevision)))return false;
 if(hasCandidate){const candidate=value.candidate;if(!candidate||typeof candidate!=="object"||Array.isArray(candidate)||!exact(candidate,["id","repository","revision","createdAt"])||!identity(candidate.id)||!identity(candidate.repository)||typeof candidate.revision!=="string"||!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/iu.test(candidate.revision)||typeof candidate.createdAt!=="string"||!Number.isFinite(Date.parse(candidate.createdAt)))return false;}
 if(hasWriteSurfaces){const surfaces=value.writeSurfaces;if(!Array.isArray(surfaces)||surfaces.length<1||surfaces.length>256||surfaces.some(surface=>typeof surface!=="string"||!surface||surface!==surface.trim()||surface.startsWith("/")||surface.includes("\\")||surface.includes(":")||surface.split("/").some(part=>!part||part==="."||part===".."))||new Set(surfaces).size!==surfaces.length)return false;}
 if(hasAuthorizationBasis){if(typeof value.writerAuthorizationBasis!=="string"||!value.writerAuthorizationBasis||value.writerAuthorizationBasis.length>16_384)return false;try{const basis=JSON.parse(value.writerAuthorizationBasis);if(!basis||typeof basis!=="object"||Array.isArray(basis)||Object.getPrototypeOf(basis)!==Object.prototype)return false;}catch{return false;}}
 const writerMetadata=hasCandidate||hasWriteSurfaces||hasAuthorizationBasis;if(writerMetadata&&(value.role!=="worker"||!hasCandidate||!hasWriteSurfaces||!hasAuthorizationBasis||!hasSelection||(value.skillSelection as SkillSelectionContext).phase!=="apply"))return false;
 if(!hasSelection)return value.role==="primary"||value.role==="clarifier";
 const selectionRaw=value.skillSelection;if(!selectionRaw||typeof selectionRaw!=="object"||Array.isArray(selectionRaw)||Object.getPrototypeOf(selectionRaw)!==Object.prototype)return false;const selection=selectionRaw as SkillSelectionContext,role=value.role as TodoPlanRole;
 const allowed=["phase","defect","codeChange","behaviorChange","risk","filesTouched","verification"],selectionKeys=Object.keys(selectionRaw);
 if(selectionKeys.some(key=>!allowed.includes(key))||!Object.hasOwn(selection,"phase")||!(["status","context-init","explore","proposal","specification","design","tasks","apply","verify","archive","skill-registry","adversarial-review","skill-authoring","skill-audit","defect","go-testing","delivery-branch","delivery-chain","issue","docs","collaboration-message"] as unknown[]).includes(selection.phase))return false;
 for(const key of ["defect","codeChange","behaviorChange","verification"])if(key in selection&&typeof (selection as Record<string,unknown>)[key]!=="boolean")return false;
 if("risk" in selection&&!(["low","medium","high","unknown"] as unknown[]).includes((selection as Record<string,unknown>).risk))return false;
 if("filesTouched" in selection&&(!Number.isSafeInteger((selection as Record<string,unknown>).filesTouched)||Number((selection as Record<string,unknown>).filesTouched)<0))return false;
 const expectedPhase:Partial<Record<TodoPlanRole,SkillPhase>>={explorer:"explore",worker:"apply",reviewer:"adversarial-review",verifier:"verify"};
 if(role==="clarifier"||expectedPhase[role]!==undefined&&expectedPhase[role]!==selection.phase)return false;
 return true;
}
function validItem(value:unknown):value is TodoItem{
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return false;
 const optionalKeys=["requestId","dependsOn","description","plan"],keys=["taskId","title","events",...optionalKeys.filter(key=>Object.hasOwn(value,key))];
 if(!exact(value,keys)||!identity(value.taskId)||("requestId" in value&&!identity(value.requestId))||("plan" in value&&(!validPlan(value.plan)||typeof value.requestId!=="string"||!value.requestId.startsWith("asen-plan:")))||("dependsOn" in value&&(!Array.isArray(value.dependsOn)||value.dependsOn.some(id=>!identity(id))||new Set(value.dependsOn).size!==value.dependsOn.length||value.dependsOn.includes(value.taskId)))||("description" in value&&(typeof value.description!=="string"||!value.description.trim()||value.description.length>8192||value.description!==value.description.trim()||/[\u0000-\u001f\u007f-\u009f]/u.test(value.description)))||typeof value.title!=="string"||!value.title.trim()||value.title.length>2048||/[\u0000-\u001f\u007f-\u009f]/u.test(value.title)||!Array.isArray(value.events)||value.events.length<1||value.events.length>MAX_EVENTS)return false;
 try{let state:TaskEvent|undefined;for(const event of value.events){if(event.taskId!==value.taskId) return false;state=applyTaskEvent(state,event);}return !!state;}catch{return false;}
}
export function parseTodoFile(raw:string):TodoFile{
 const value:unknown=JSON.parse(raw);if(!exact(value,["schema","revision","items"])||value.schema!==SCHEMA||!Number.isSafeInteger(value.revision)||Number(value.revision)<0||!Array.isArray(value.items)||value.items.length>MAX_TASKS||!value.items.every(validItem))throw new Error("Invalid ASEN Todo store");
 const items=value.items as unknown as TodoItem[],ids=new Set<string>(),byId=new Map<string,TodoItem>();for(const item of items){if(ids.has(item.taskId))throw new Error("Duplicate ASEN Todo task id");ids.add(item.taskId);byId.set(item.taskId,item);}
 const visiting=new Set<string>(),visited=new Set<string>();const visit=(item:TodoItem)=>{if(visiting.has(item.taskId))throw new Error("Todo dependency cycle");if(visited.has(item.taskId))return;visiting.add(item.taskId);for(const id of item.dependsOn??[]){const dependency=byId.get(id);if(!dependency||dependency.events[0]?.sessionId!==item.events[0]?.sessionId||!sameWorkspaceIdentityPath(dependency.events[0]!.projectId,item.events[0]!.projectId))throw new Error("Todo dependency identity mismatch");visit(dependency);}visiting.delete(item.taskId);visited.add(item.taskId);};for(const item of items)visit(item);
 const count=items.reduce((total,item)=>total+item.events.length,0);if(count>MAX_EVENTS)throw new Error("ASEN Todo history exceeds its limit");
 return {schema:SCHEMA,revision:Number(value.revision),items:items.map(item=>structuredClone(item))};
}
async function read(file:string):Promise<TodoFile>{if(!await preparePrivateFile(file))return {schema:SCHEMA,revision:0,items:[]};return parseTodoFile(await readFile(file,"utf8"));}
async function write(file:string,value:TodoFile){await preparePrivateFile(file,true);await atomicWriteText(file,`${JSON.stringify(value,null,2)}\n`);}

function isCorruptTodoError(error:unknown):boolean{return error instanceof SyntaxError||error instanceof Error&&["Invalid ASEN Todo store","Duplicate ASEN Todo task id","ASEN Todo dependency cycle","Todo dependency identity mismatch","ASEN Todo history exceeds its limit"].includes(error.message);}

async function preparePrivateDirectory(directory:string):Promise<void>{await mkdir(directory,{recursive:true,mode:0o700});if(process.platform!=="win32")await chmod(directory,0o700);}
async function readIfPresent(file:string):Promise<string|undefined>{try{return await readFile(file,"utf8");}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return undefined;throw error;}}
function sameTodoItem(left:TodoItem,right:TodoItem):boolean{return JSON.stringify(left)===JSON.stringify(right);}
async function migrateLegacyTodoFile(root:string,legacyFile:string):Promise<void>{
 await preparePrivateDirectory(root);await preparePrivateDirectory(path.join(root,"projects"));
 const marker=path.join(root,"migration-v1.json"),backup=`${legacyFile}.migrated-v1`;
 await preparePrivateFile(marker,true);await preparePrivateFile(legacyFile);await preparePrivateFile(backup);
 await withExclusiveFileLock(marker,async()=>{
  const existingMarker=await readIfPresent(marker);
  if(existingMarker!==undefined){let parsed:unknown;try{parsed=JSON.parse(existingMarker);}catch{throw new Error("ASEN Todo migration marker is corrupt; legacy data was preserved");}if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||(parsed as {schema?:unknown}).schema!=="asen.todo-migration/v1")throw new Error("ASEN Todo migration marker is invalid; legacy data was preserved");return;}
  let source=await readIfPresent(legacyFile),sourcePath=legacyFile;
  if(source===undefined){source=await readIfPresent(backup);sourcePath=backup;}
  let migratedProjects=0,sourceDigest="none";
  if(source!==undefined){
   const legacy=parseTodoFile(source),groups=new Map<string,TodoItem[]>();sourceDigest=createHash("sha256").update(source).digest("hex");
   for(const item of legacy.items){const project=item.events[0]?.projectId;if(!project)throw new Error("Legacy ASEN Todo task has no project identity; source data was preserved");const key=projectKey(project),group=groups.get(key)??[];group.push(item);groups.set(key,group);}
   for(const [key,items]of groups){const destination=path.join(root,"projects",key,"active.json");await preparePrivateFile(destination,true);const current=await readIfPresent(destination);let merged=items;
    if(current!==undefined){const prior=parseTodoFile(current),byId=new Map(prior.items.map(item=>[item.taskId,item]));for(const item of items){const found=byId.get(item.taskId);if(found&&!sameTodoItem(found,item))throw new Error("Legacy ASEN Todo migration conflicts with an existing project shard; source data was preserved");byId.set(item.taskId,item);}merged=[...byId.values()];}
    const checked=parseTodoFile(JSON.stringify({schema:SCHEMA,revision:current===undefined?legacy.revision:parseTodoFile(current).revision+1,items:merged}));await write(destination,checked);const verified=await read(destination);if(JSON.stringify(verified.items)!==JSON.stringify(checked.items))throw new Error("ASEN Todo project shard verification failed; legacy source was preserved");migratedProjects++;
   }
   const oldBackup=await readIfPresent(backup);
   if(sourcePath===legacyFile){if(oldBackup!==undefined&&createHash("sha256").update(oldBackup).digest("hex")!==sourceDigest)throw new Error("Existing ASEN Todo migration backup differs from the legacy source");if(oldBackup===undefined)await rename(legacyFile,backup);}
   else if(oldBackup===undefined)throw new Error("ASEN Todo migration backup disappeared; no source data was removed");
  }
  await atomicWriteText(marker,`${JSON.stringify({schema:"asen.todo-migration/v1",sourceDigest,migratedProjects})}\n`);
 },30000);
}

/** Private, revisioned per-session TODO projection; ODD task mirrors remain a separate store. */
export class SessionTodoStore{
 private constructor(readonly path:string,private readonly now:()=>string,private readonly quarantined?:string,private readonly projectScoped=false){}
 static async open(path:string,now:()=>string=()=>new Date().toISOString()):Promise<SessionTodoStore>{
  await preparePrivateFile(path,true);let quarantined:string|undefined;
  try{await read(path);}catch(error){
   if(!isCorruptTodoError(error))throw error;
   await withExclusiveFileLock(path,async()=>{
    // Another startup or writer may have already recovered the observed bad file.
    try{await read(path);}catch(currentError){
     if(!isCorruptTodoError(currentError))throw currentError;
     quarantined=`${path}.corrupt-${Date.now()}-${randomUUID()}`;await rename(path,quarantined);
    }
   });
  }
  return new SessionTodoStore(path,now,quarantined);
 }
 static async openProjectScoped(root:string,legacyFile:string,now:()=>string=()=>new Date().toISOString()):Promise<SessionTodoStore>{await migrateLegacyTodoFile(root,legacyFile);return new SessionTodoStore(root,now,undefined,true);}
 diagnostics(){return this.quarantined?{quarantined:this.quarantined}:undefined;}
 #file(context:TodoContext):string{return this.projectScoped?path.join(this.path,"projects",projectKey(context.projectId),"active.json"):this.path;}
 async #reconcileArchive(file:string):Promise<void>{
  const markerFile=`${file}.archive-pending.json`;await preparePrivateFile(markerFile,true);const rawMarker=await readIfPresent(markerFile);if(rawMarker===undefined)return;
  let marker:unknown;try{marker=JSON.parse(rawMarker);}catch{throw new Error("ASEN Todo archive transaction marker is corrupt; active data was preserved");}
  if(!exact(marker,["schema","archiveFile","sha256","revision"])||marker.schema!=="asen.todo-archive-transaction/v1"||typeof marker.archiveFile!=="string"||!/^archive-[0-9]+-[a-f0-9]{12}\.json$/u.test(marker.archiveFile)||typeof marker.sha256!=="string"||!/^[a-f0-9]{64}$/u.test(marker.sha256)||!Number.isSafeInteger(marker.revision))throw new Error("ASEN Todo archive transaction marker is invalid; active data was preserved");
  const archiveFile=path.join(path.dirname(file),"archive",marker.archiveFile);await preparePrivateFile(archiveFile,true);const archivedRaw=await readIfPresent(archiveFile);
  if(archivedRaw===undefined){await rm(markerFile,{force:true});return;}
  if(createHash("sha256").update(archivedRaw).digest("hex")!==marker.sha256)throw new Error("ASEN Todo archive checksum mismatch; active data was preserved");
  const archived=parseTodoFile(archivedRaw);if(archived.revision!==marker.revision||!allTerminal(archived))throw new Error("ASEN Todo archive snapshot is invalid; active data was preserved");
  const active=await read(file);if(active.revision<=archived.revision){
   const archivedById=new Map(archived.items.map(item=>[item.taskId,item]));
   for(const item of active.items){const final=archivedById.get(item.taskId);if(!final||item.events.length>final.events.length||item.events.some((event,index)=>JSON.stringify(event)!==JSON.stringify(final.events[index])))throw new Error("ASEN Todo archive does not preserve the active task prefix; active data was preserved");}
   await write(file,emptyTodoFile(archived.revision+1));
  }
  await rm(markerFile,{force:true});
 }
 async #archiveCompletedProject(file:string,data:TodoFile):Promise<void>{
  const snapshot=parseTodoFile(JSON.stringify(data)),raw=`${JSON.stringify(snapshot,null,2)}\n`,digest=createHash("sha256").update(raw).digest("hex"),archiveName=`archive-${snapshot.revision}-${digest.slice(0,12)}.json`,archiveFile=path.join(path.dirname(file),"archive",archiveName),markerFile=`${file}.archive-pending.json`;
  await atomicWriteText(markerFile,`${JSON.stringify({schema:"asen.todo-archive-transaction/v1",archiveFile:archiveName,sha256:digest,revision:snapshot.revision})}\n`);
  await write(archiveFile,snapshot);const verified=await readFile(archiveFile,"utf8");if(createHash("sha256").update(verified).digest("hex")!==digest||JSON.stringify(parseTodoFile(verified))!==JSON.stringify(snapshot))throw new Error("ASEN Todo archive verification failed; active data was preserved");
  await write(file,emptyTodoFile(snapshot.revision+1));await rm(markerFile,{force:true});
 }
 async #readSnapshot(context:TodoContext):Promise<TodoFile>{const file=this.#file(context);await preparePrivateFile(file,true);return read(file);}
 async #archivedItems(file:string,context:TodoContext):Promise<(TodoItem&{current:TaskEvent})[]>{const directory=path.join(path.dirname(file),"archive");let names:string[]=[];try{names=await readdir(directory);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return [];throw error;}const items:(TodoItem&{current:TaskEvent})[]=[];for(const name of names.filter(value=>/^archive-[0-9]+-[a-f0-9]{12}\.json$/u.test(value)).sort()){const data=await read(path.join(directory,name));items.push(...data.items.flatMap(item=>{const current=replayTask(item.events);return current&&current.sessionId===context.sessionId&&sameWorkspaceIdentityPath(current.projectId,context.projectId)?[{...structuredClone(item),current}]:[];}));}return items;}
 async add(title:string,context:TodoContext,signal?:AbortSignal,validateContext?:()=>void,requestId?:string,dependsOn:readonly string[]=[],description?:string,plan?:TodoPlanMetadata):Promise<TodoItem>{
  throwIfCancelled(signal);
  if(typeof title!=="string"||!title.trim()||title!==title.trim()||title.length>2048||/[\u0000-\u001f\u007f-\u009f]/u.test(title)||!identity(context.sessionId)||!identity(context.projectId)||(requestId!==undefined&&!identity(requestId))||!Array.isArray(dependsOn)||dependsOn.some(id=>!identity(id))||new Set(dependsOn).size!==dependsOn.length||(description!==undefined&&(typeof description!=="string"||!description||description!==description.trim()||description.length>8192||/[\u0000-\u001f\u007f-\u009f]/u.test(description)))||(plan!==undefined&&!validPlan(plan))||(plan!==undefined&&(requestId===undefined||!requestId.startsWith("asen-plan:"))))throw new Error("Invalid ASEN Todo task");
  const taskId=`todo-${randomUUID()}`,event:TaskEvent={taskId,sessionId:context.sessionId,projectId:context.projectId,revision:1,state:"planned",at:this.now()},item:TodoItem={taskId,title,events:[event],...(requestId?{requestId}:{}),...(dependsOn.length?{dependsOn:[...dependsOn]}:{}),...(description?{description}:{}),...(plan?{plan:structuredClone(plan)}:{})};let result:TodoItem|undefined;
  await this.#mutate(context,data=>{validateContext?.();
   if(requestId){const existing=data.items.find(candidate=>candidate.requestId===requestId);if(existing){const owner=existing.events[0];if(owner?.sessionId!==context.sessionId||!sameWorkspaceIdentityPath(owner.projectId,context.projectId))throw new Error("Todo request id belongs to another session or project");if(existing.title!==title||JSON.stringify(existing.dependsOn??[])!==JSON.stringify(dependsOn)||existing.description!==description||JSON.stringify(existing.plan??null)!==JSON.stringify(plan??null))throw new Error("Todo request id conflicts with the existing task");result=structuredClone(existing);return false;}}
   for(const dependency of dependsOn){const prerequisite=data.items.find(candidate=>candidate.taskId===dependency&&candidate.events[0]?.sessionId===context.sessionId&&sameWorkspaceIdentityPath(candidate.events[0]!.projectId,context.projectId));if(!prerequisite)throw new Error("Todo dependency must belong to the current session and project");if(dependency===taskId)throw new Error("Todo dependency cycle rejected");}
   data.items.push(item);result=item;return true;
  },signal);return structuredClone(result!);
 }
 /** Persist a complete executable plan in one journal transaction; dependencies use sibling request ids. */
 async addPlan(drafts:readonly TodoPlanDraft[],context:TodoContext,signal?:AbortSignal,validateContext?:()=>void):Promise<TodoItem[]>{
  if(!Array.isArray(drafts)||drafts.length<1||drafts.length>100||!identity(context.sessionId)||!identity(context.projectId))throw new Error("Invalid ASEN Todo plan");
  const seen=new Set<string>();
  for(const draft of drafts){
   if(!draft||typeof draft!=="object"||typeof draft.title!=="string"||!draft.title.trim()||draft.title!==draft.title.trim()||draft.title.length>2048||/[\u0000-\u001f\u007f-\u009f]/u.test(draft.title)||!identity(draft.requestId)||!draft.requestId.startsWith("asen-plan:")||seen.has(draft.requestId)||!Array.isArray(draft.dependsOn)||draft.dependsOn.some((id:string)=>!identity(id))||new Set(draft.dependsOn).size!==draft.dependsOn.length||typeof draft.description!=="string"||!draft.description.trim()||draft.description!==draft.description.trim()||draft.description.length>8192||/[\u0000-\u001f\u007f-\u009f]/u.test(draft.description)||!validPlan(draft.plan))throw new Error("Invalid ASEN Todo plan task");
   seen.add(draft.requestId);
  }
  const ids=new Map(drafts.map(draft=>[draft.requestId,`todo-${randomUUID()}`]));let result:TodoItem[]=[];
  await this.#mutate(context,async data=>{
   validateContext?.();const plannedIds=new Map(ids),existingByRequest=new Map(data.items.flatMap(item=>item.requestId?[[item.requestId,item] as const]:[]));
   const archivedItems=await this.#archivedItems(this.#file(context),context);for(const item of archivedItems)if(item.requestId)existingByRequest.set(item.requestId,item);
   for(const draft of drafts){const existing=existingByRequest.get(draft.requestId);if(!existing)continue;const owner=existing.events[0];if(owner?.sessionId!==context.sessionId||!sameWorkspaceIdentityPath(owner.projectId,context.projectId))throw new Error("Todo request id belongs to another session or project");plannedIds.set(draft.requestId,existing.taskId);}
   const newItems:TodoItem[]=[],byRequest=new Map(existingByRequest);
   for(const draft of drafts){
    const dependencies=draft.dependsOn.map((request:string)=>{const id=plannedIds.get(request);if(!id)throw new Error("ASEN Todo plan dependency is missing");const prior=byRequest.get(request);if(prior&&(!prior.events[0]||prior.events[0].sessionId!==context.sessionId||!sameWorkspaceIdentityPath(prior.events[0].projectId,context.projectId)))throw new Error("Todo dependency must belong to the current session and project");return id;});
    const existing=byRequest.get(draft.requestId);if(existing){if(existing.title!==draft.title||JSON.stringify(existing.dependsOn??[])!==JSON.stringify(dependencies)||existing.description!==draft.description||JSON.stringify(existing.plan??null)!==JSON.stringify(draft.plan))throw new Error("Todo request id conflicts with the existing task");continue;}
    const taskId=plannedIds.get(draft.requestId)!;if(dependencies.includes(taskId))throw new Error("Todo dependency cycle rejected");
    const item:TodoItem={taskId,title:draft.title,events:[{taskId,sessionId:context.sessionId,projectId:context.projectId,revision:1,state:"planned",at:this.now()}],requestId:draft.requestId,...(dependencies.length?{dependsOn:dependencies}:{}),description:draft.description,plan:structuredClone(draft.plan)};
    newItems.push(item);byRequest.set(draft.requestId,item);
   }
   data.items.push(...newItems);result=drafts.map(draft=>structuredClone(byRequest.get(draft.requestId)!));return newItems.length>0;
  },signal);return result;
 }
 async update(taskId:string,context:TodoContext,expectedRevision:number,state:TaskState,reason?:string,signal?:AbortSignal,validateContext?:()=>void):Promise<TodoItem>{
  if(!identity(taskId)||!identity(context.sessionId)||!identity(context.projectId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)throw new Error("Invalid ASEN Todo update");let updated:TodoItem|undefined;
  await this.#mutate(context,data=>{validateContext?.();const item=data.items.find(x=>x.taskId===taskId&&x.events.at(-1)?.sessionId===context.sessionId&&sameWorkspaceIdentityPath(x.events.at(-1)!.projectId,context.projectId));if(!item)throw new Error("Todo task is unavailable to this session or project");const current=replayTask(item.events);if(!current||current.revision!==expectedRevision)throw new Error("Todo revision conflict");if(state==="running")for(const dependency of item.dependsOn??[]){const prerequisite=data.items.find(candidate=>candidate.taskId===dependency&&candidate.events.at(-1)?.sessionId===context.sessionId&&sameWorkspaceIdentityPath(candidate.events.at(-1)!.projectId,context.projectId)),prerequisiteState=prerequisite&&replayTask(prerequisite.events);if(prerequisiteState?.state!=="succeeded"&&prerequisiteState?.state!=="done")throw new Error("Todo dependencies must be verified done or have a successful execution awaiting review before this task can run");}const event:TaskEvent={taskId,sessionId:context.sessionId,projectId:current.projectId,revision:expectedRevision+1,state,at:this.now(),...(reason?{reason}:{})};const next=applyTaskEvent(current,event);item.events.push(next);updated=structuredClone(item);},signal);return updated!;
 }
 /** Serialize an agent launch claim with Todo updates. `launch` runs synchronously
  * after the durable running event and before the Todo lock is released. */
 async withAgentLaunch(taskId:string,context:TodoContext,prepare:()=>Promise<void>,launch:()=>void,validateContext?:()=>void|Promise<void>):Promise<void>{
  if(!identity(taskId)||!identity(context.sessionId)||!identity(context.projectId))throw new Error("Invalid ASEN agent launch identity");
  const file=this.#file(context);await preparePrivateFile(file,true);
  await withExclusiveFileLock(file,async()=>{
   await this.#reconcileArchive(file);await validateContext?.();const data=await read(file);await validateContext?.();const item=data.items.find(x=>x.taskId===taskId&&x.events.at(-1)?.sessionId===context.sessionId&&sameWorkspaceIdentityPath(x.events.at(-1)!.projectId,context.projectId));
   if(!item)throw new Error("Todo task is unavailable to this session or project");
   const current=replayTask(item.events);
   if(!current||!(current.state==="planned"||current.state==="running"))throw new Error("Todo must remain active before agent launch");
   for(const dependency of item.dependsOn??[]){const prerequisite=data.items.find(candidate=>candidate.taskId===dependency&&candidate.events.at(-1)?.sessionId===context.sessionId&&sameWorkspaceIdentityPath(candidate.events.at(-1)!.projectId,context.projectId)),prerequisiteState=prerequisite&&replayTask(prerequisite.events);if(prerequisiteState?.state!=="succeeded"&&prerequisiteState?.state!=="done")throw new Error("Todo dependencies must be verified done or have a successful execution awaiting review before agent launch");}
   await prepare();await validateContext?.();
   const transitionedToRunning=current.state==="planned";
   if(transitionedToRunning){
    const event:TaskEvent={taskId,sessionId:context.sessionId,projectId:current.projectId,revision:current.revision+1,state:"running",at:this.now(),reason:"Agent launch claimed before dispatch"};
    item.events.push(applyTaskEvent(current,event));
    if(data.items.reduce((total,candidate)=>total+candidate.events.length,0)>MAX_EVENTS)throw new Error("ASEN Todo store has reached its history limit");
    const next=parseTodoFile(JSON.stringify({...data,revision:data.revision+1}));
    await write(file,next);
   }
   try{await validateContext?.();launch();}catch(error){
    if(transitionedToRunning){
     const running=item.events.at(-1)!;
     const blocked:TaskEvent={taskId,sessionId:context.sessionId,projectId:running.projectId,revision:running.revision+1,state:"blocked",at:this.now(),reason:"Agent launch was interrupted before dispatch"};
     item.events.push(applyTaskEvent(running,blocked));
     try{await write(file,parseTodoFile(JSON.stringify({...data,revision:data.revision+2})));}catch{/* Startup recovery will fail closed if the launch claim cannot be reconciled. */}
    }
    throw error;
   }
  },30000);
 }
 async list(context:TodoContext):Promise<readonly (TodoItem&{current:TaskEvent})[]>{if(!identity(context.sessionId)||!identity(context.projectId))throw new Error("Invalid ASEN Todo session");const data=await this.#readSnapshot(context);return data.items.flatMap(item=>{const current=replayTask(item.events);return current&&current.sessionId===context.sessionId&&sameWorkspaceIdentityPath(current.projectId,context.projectId)?[{...structuredClone(item),current}]:[];});}
 async archived(context:TodoContext):Promise<readonly (TodoItem&{current:TaskEvent})[]>{if(!identity(context.sessionId)||!identity(context.projectId))throw new Error("Invalid ASEN Todo session");return this.#archivedItems(this.#file(context),context);}
 async history(taskId:string,context:TodoContext):Promise<readonly TaskEvent[]>{const data=await this.#readSnapshot(context);let item=data.items.find(x=>x.taskId===taskId&&x.events.at(-1)?.sessionId===context.sessionId&&sameWorkspaceIdentityPath(x.events.at(-1)!.projectId,context.projectId));if(!item)item=(await this.archived(context)).find(x=>x.taskId===taskId);return item?item.events.map(event=>structuredClone(event)):[];}
 async recover(context:TodoContext,reason:"restart"|"shutdown"="restart"):Promise<void>{if(!identity(context.sessionId)||!identity(context.projectId)||!(reason==="restart"||reason==="shutdown"))throw new Error("Invalid ASEN Todo recovery session");await this.#mutate(context,data=>{for(const item of data.items){const current=replayTask(item.events);if(current?.state!=="running"||current.sessionId!==context.sessionId||!sameWorkspaceIdentityPath(current.projectId,context.projectId))continue;const blocked:TaskEvent={taskId:item.taskId,sessionId:current.sessionId,projectId:current.projectId,revision:current.revision+1,state:"blocked",at:this.now(),reason:reason==="shutdown"?"Pi session ended while this task was running; explicit review is required before continuing":"ASEN restarted while this task was running; explicit review is required before continuing"};item.events.push(applyTaskEvent(current,blocked));}});}
 async #mutate(context:TodoContext,change:(data:TodoFile)=>void|boolean|Promise<void|boolean>,signal?:AbortSignal):Promise<void>{
  const file=this.#file(context);throwIfCancelled(signal);await preparePrivateFile(file,true);throwIfCancelled(signal);
  try{await withExclusiveFileLock(file,async()=>{throwIfCancelled(signal);await this.#reconcileArchive(file);const data=await read(file);throwIfCancelled(signal);if(await change(data)===false)return;if(data.items.length>MAX_TASKS||data.items.reduce((total,item)=>total+item.events.length,0)>MAX_EVENTS)throw new Error("ASEN Todo store has reached its history limit");const next=parseTodoFile(JSON.stringify({...data,revision:data.revision+1}));throwIfCancelled(signal);
   // Cancellation is deferred once the atomic transaction starts, so it can commit at rename or fail without a partial destination.
   if(this.projectScoped&&allTerminal(next))await this.#archiveCompletedProject(file,next);else await write(file,next);
  },30000,signal);}
  catch(error){throwIfCancelled(signal);throw error;}
 }
}
