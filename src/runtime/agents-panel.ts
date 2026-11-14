import type {PublicAgentRecord,PublicAgentState} from "./agent-lifecycle.js";
import type {AgentStateEvent} from "./agent-store.js";
import type {AgentNoticeRow} from "./agent-notification-journal.js";
import {sanitizeTerminalText,truncateForTerminal} from "./responsive-layout.js";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";

export interface AgentHierarchyRecord{
 readonly id:PublicAgentRecord["id"];
 readonly role:PublicAgentRecord["role"];
 readonly owner:Readonly<PublicAgentRecord["owner"]>;
 readonly sessionId:PublicAgentRecord["sessionId"];
 readonly projectId:PublicAgentRecord["projectId"];
 readonly state:PublicAgentState;
 readonly createdAt:string;
 readonly updatedAt:string;
 readonly history:readonly Pick<AgentStateEvent,"id"|"revision"|"state"|"at">[];
 readonly continuationOf?:string;
}
export interface AgentHierarchyTaskAssociation{readonly taskId:string;readonly agentId:string;readonly sessionId:string;readonly projectId:string;}
export interface AgentHierarchyInput{readonly identity:{readonly sessionId:string;readonly projectId:string};readonly records:readonly AgentHierarchyRecord[];readonly associations:readonly AgentHierarchyTaskAssociation[];}
export type AgentHierarchyLineage={readonly kind:"root"}|{readonly kind:"proven";readonly parentId:string}|{readonly kind:"unresolved";readonly continuationOf:string};
export type AgentHierarchyAssociation={readonly kind:"none"}|{readonly kind:"task";readonly taskId:string};
export interface AgentHierarchyRow extends AgentHierarchyRecord{readonly depth:number;readonly lineage:AgentHierarchyLineage;readonly association:AgentHierarchyAssociation;}

const states=new Set<PublicAgentState>(["queued","running","interrupted","cancelled","failed","completed"]);
const text=(value:unknown):value is string=>typeof value==="string"&&value.length>0&&value===value.trim();
const timestamp=(value:unknown):value is string=>typeof value==="string"&&Number.isFinite(Date.parse(value));
const compareOpaque=(left:string,right:string):number=>left<right?-1:left>right?1:0;
function inScope(sessionId:string,projectId:string,identity:AgentHierarchyInput["identity"]):boolean{
 return sessionId===identity.sessionId&&sameWorkspaceIdentityPath(projectId,identity.projectId);
}
function copyHistory(record:AgentHierarchyRecord):AgentHierarchyRow["history"]{
 if(!Array.isArray(record.history))throw new Error("Invalid agent lifecycle history");
 const revisions=new Set<number>();
 const history=record.history.map(event=>{
  if(!event||event.id!==record.id||!Number.isSafeInteger(event.revision)||event.revision<1||revisions.has(event.revision)||!states.has(event.state)||!timestamp(event.at))throw new Error("Invalid agent lifecycle history");
  revisions.add(event.revision);
  return Object.freeze({id:event.id,revision:event.revision,state:event.state,at:event.at});
 }).sort((left,right)=>left.revision-right.revision);
 return Object.freeze(history);
}

/** Pure narrow hierarchy projection. Store access, actions and terminal formatting belong to parent-owned adapters. */
export function projectAgentHierarchy(input:AgentHierarchyInput):readonly AgentHierarchyRow[]{
 if(!input||!text(input.identity?.sessionId)||!text(input.identity?.projectId)||!Array.isArray(input.records)||!Array.isArray(input.associations))throw new Error("Invalid agent hierarchy input");
 const records=new Map<string,AgentHierarchyRecord>();
 for(const record of input.records){
  if(!record||!text(record.id)||records.has(record.id))throw new Error("Duplicate or invalid agent record");
  if(!text(record.role)||!record.owner||!["user","agent","system"].includes(record.owner.kind)||!text(record.owner.id)||!text(record.sessionId)||!text(record.projectId)||!inScope(record.sessionId,record.projectId,input.identity)||!states.has(record.state)||!timestamp(record.createdAt)||!timestamp(record.updatedAt))throw new Error("Agent record is outside the requested scope or invalid");
  if(record.continuationOf!==undefined&&!text(record.continuationOf))throw new Error("Invalid agent continuation");
  records.set(record.id,record);
 }
 const children=new Set<string>();
 for(const record of records.values())if(record.continuationOf&&record.role==="explorer"&&records.get(record.continuationOf)?.role==="explorer"){
  if(children.has(record.continuationOf))throw new Error("Conflicting agent continuation");children.add(record.continuationOf);
 }
 const tasks=new Map<string,string>();
 for(const link of input.associations){
  if(!link||!text(link.taskId)||!text(link.agentId)||!text(link.sessionId)||!text(link.projectId)||!inScope(link.sessionId,link.projectId,input.identity)||!records.has(link.agentId))throw new Error("Task association is foreign to the requested scope");
  if(tasks.has(link.agentId))throw new Error("Conflicting task association");tasks.set(link.agentId,link.taskId);
 }
 const depths=new Map<string,number|null>();
 const depth=(id:string,visiting:Set<string>):number|null=>{
  const cached=depths.get(id);if(cached!==undefined||depths.has(id))return cached??null;
  const record=records.get(id);if(!record)throw new Error("Agent hierarchy record disappeared");
  if(!record.continuationOf){depths.set(id,0);return 0;}
  if(record.role!=="explorer"){depths.set(id,null);return null;}
  const parent=records.get(record.continuationOf);
  if(!parent||parent.role!=="explorer"||visiting.has(id)){depths.set(id,null);return null;}
  const next=new Set(visiting);next.add(id);
  const parentDepth=depth(parent.id,next),resolved=parentDepth===null?null:parentDepth+1;
  depths.set(id,resolved);return resolved;
 };
 const rows=[...records.values()].sort((left,right)=>Date.parse(left.createdAt)-Date.parse(right.createdAt)||compareOpaque(left.id,right.id)).map(record=>{
  const resolvedDepth=depth(record.id,new Set());let lineage:AgentHierarchyLineage;
  if(record.continuationOf){
   lineage=resolvedDepth===null?Object.freeze({kind:"unresolved",continuationOf:record.continuationOf}):Object.freeze({kind:"proven",parentId:record.continuationOf});
  }else lineage=Object.freeze({kind:"root"});
  const taskId=tasks.get(record.id),association:AgentHierarchyAssociation=taskId===undefined?Object.freeze({kind:"none"}):Object.freeze({kind:"task",taskId});
  const row={id:record.id,role:record.role,owner:Object.freeze({kind:record.owner.kind,id:record.owner.id}),sessionId:record.sessionId,projectId:record.projectId,state:record.state,createdAt:record.createdAt,updatedAt:record.updatedAt,history:copyHistory(record),depth:resolvedDepth??0,lineage,association};
  return Object.freeze(record.continuationOf===undefined?row:{...row,continuationOf:record.continuationOf});
 });
 return Object.freeze(rows);
}

export interface AgentFollowQuery{readonly agentId:string;readonly sessionId:string;readonly projectId:string;}
const deliveries=new Set<string>(["pending","attempted","enqueued","acknowledged"]);

/** Read-only journal tail selection: the trusted agent inside the exact session and project scope, ascending, bounded to the last N. */
export function selectAgentFollowTail(rows:readonly AgentNoticeRow[],query:AgentFollowQuery,limit=40):readonly AgentNoticeRow[]{
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error("Invalid agent follow limit");
 if(!query||!text(query.agentId)||!text(query.sessionId)||!text(query.projectId))throw new Error("Invalid agent follow identity");
 if(!Array.isArray(rows))throw new Error("Invalid agent follow rows");
 return Object.freeze(rows
  .filter(row=>!!row&&row.agentId===query.agentId&&row.sessionId===query.sessionId&&sameWorkspaceIdentityPath(row.projectId,query.projectId)&&deliveries.has(row.delivery))
  .slice()
  .sort((left,right)=>Date.parse(left.updatedAt)-Date.parse(right.updatedAt)||compareOpaque(left.eventId,right.eventId)||compareOpaque(left.createdAt,right.createdAt))
  .slice(-limit));
}

/** Renders the journal tail verbatim; queueing is never presented as delivery, acknowledgement or consumption, and Follow grants nothing. */
export function renderAgentFollowTail(rows:readonly AgentNoticeRow[],query:AgentFollowQuery,width=100):readonly string[]{
 if(!Number.isSafeInteger(width)||width<12||width>1000)throw new Error("Invalid agent follow width");
 const tail=selectAgentFollowTail(rows,query);
 const clean=(value:string,max=160)=>truncateForTerminal(sanitizeTerminalText(value).replace(/\s+/gu," ").trim(),Math.min(max,width));
 const out:string[]=["FOLLOW · "+clean(query.agentId,180)+" · read-only journal tail"];
 if(tail.length===0)out.push("No agent notification journal entries for this agent in this session/project.");
 for(const row of tail)out.push("  "+clean(row.updatedAt,32)+" · "+clean(row.state,24)+" · delivery: "+clean(row.delivery,20));
 out.push("Journal states are verbatim; queueing grants no consumption or authorization.");
 return Object.freeze(out.map(row=>truncateForTerminal(row,width)));
}
