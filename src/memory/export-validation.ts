import type {
 MemoryDeletionMarker,
 MemoryExport,
 MemoryItem,
 MemoryRelation,
 MemorySessionState,
 MemorySessionSummary
} from "./types.js";

const exportKeys=["version","projectId","observations","relations","summaries","sessions","deletions"] as const;
const itemKeys=["id","projectId","sessionId","kind","topic","content","createdAt","pinned","title","scope","toolName","topicKey","revisionCount","duplicateCount","lastSeenAt","updatedAt"] as const;
const relationKeys=["id","sourceId","targetId","relation","projectId","createdAt","reviewedAt"] as const;
const summaryKeys=["projectId","sessionId","content","createdAt"] as const;
const sessionKeys=["projectId","sessionId","rootSessionId","parentSessionId","status"] as const;
const deletionKeys=["id","projectId","deletedAt","mode","item"] as const;
const memoryKinds=new Set(["observation","decision","summary","prompt"]);
const relationKinds=new Set(["related","compatible","scoped","conflicts_with","supersedes","not_conflict"]);

export class ProjectMemoryExportValidationError extends Error {
 constructor(readonly reason:"project-mismatch"|"invalid-export"){
  super(reason==="project-mismatch"?"Project memory backup project mismatch":"Invalid project memory backup export");
 }
}

function record(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value);}
function exactKeys(value:Record<string,unknown>,allowed:readonly string[]):boolean{
 const keys=Object.keys(value);
 return keys.every(key=>allowed.includes(key))&&keys.length===new Set(keys).size;
}
function string(value:unknown,nonblank=false):value is string{return typeof value==="string"&&(!nonblank||value.trim().length>0);}
function optionalString(value:unknown):boolean{return value===undefined||typeof value==="string";}
function finiteCount(value:unknown):boolean{return value===undefined||(typeof value==="number"&&Number.isSafeInteger(value)&&value>=0);}
function validItem(value:unknown,projectId:string):value is MemoryItem{
 if(!record(value)||!exactKeys(value,itemKeys))return false;
 return string(value.id,true)&&value.projectId===projectId&&string(value.sessionId,true)&&typeof value.kind==="string"&&memoryKinds.has(value.kind)&&
  optionalString(value.topic)&&string(value.content)&&string(value.createdAt)&&
  (value.pinned===undefined||typeof value.pinned==="boolean")&&optionalString(value.title)&&optionalString(value.scope)&&
  optionalString(value.toolName)&&optionalString(value.topicKey)&&finiteCount(value.revisionCount)&&finiteCount(value.duplicateCount)&&
  optionalString(value.lastSeenAt)&&optionalString(value.updatedAt);
}
function validRelation(value:unknown,projectId:string):value is MemoryRelation{
 return record(value)&&exactKeys(value,relationKeys)&&string(value.id,true)&&string(value.sourceId,true)&&string(value.targetId,true)&&
  typeof value.relation==="string"&&relationKinds.has(value.relation)&&value.projectId===projectId&&string(value.createdAt)&&optionalString(value.reviewedAt);
}
function validSummary(value:unknown,projectId:string):value is MemorySessionSummary{
 return record(value)&&exactKeys(value,summaryKeys)&&value.projectId===projectId&&string(value.sessionId,true)&&string(value.content)&&string(value.createdAt);
}
function validSession(value:unknown,projectId:string):value is MemorySessionState{
 return record(value)&&exactKeys(value,sessionKeys)&&value.projectId===projectId&&string(value.sessionId,true)&&string(value.rootSessionId,true)&&
  optionalString(value.parentSessionId)&&(value.status==="live"||value.status==="ended");
}
function validDeletion(value:unknown,projectId:string):value is MemoryDeletionMarker{
 if(!record(value)||!exactKeys(value,deletionKeys)||!string(value.id,true)||value.projectId!==projectId||!string(value.deletedAt,true))return false;
 if(value.mode==="soft")return validItem(value.item,projectId)&&value.item.id===value.id;
 return value.mode==="hard"&&value.item===undefined;
}
function hasCycle(sessionId:string,byId:Map<string,MemorySessionState>):boolean{
 const seen=new Set<string>();let current:MemorySessionState|undefined=byId.get(sessionId);
 while(current?.parentSessionId){if(seen.has(current.sessionId))return true;seen.add(current.sessionId);current=byId.get(current.parentSessionId);}
 return false;
}

/**
 * Preserves the legacy relational import checks and their existing error order/messages.
 * Callers of the legacy import path remain permissive about unknown object fields.
 */
export function validateMemoryImport(data:MemoryExport,sessions:MemorySessionState[]):void{
 const sessionIds=new Set<string>();
 for(const s of sessions){if(s.projectId!==data.projectId||!s.sessionId.trim()||!s.rootSessionId.trim()||sessionIds.has(s.sessionId))throw new Error("Invalid memory import session");sessionIds.add(s.sessionId);}
 for(const s of sessions)if(s.parentSessionId&&!sessionIds.has(s.parentSessionId))throw new Error("Invalid memory import session ancestry");
 const deletionIds=new Set<string>();for(const deletion of data.deletions??[]){if(deletionIds.has(deletion.id))throw new Error("Invalid memory import deletion");deletionIds.add(deletion.id);}
 const observationIds=new Set<string>();
 for(const item of data.observations){if(item.projectId!==data.projectId||!sessionIds.has(item.sessionId)||observationIds.has(item.id))throw new Error("Invalid memory import observation");observationIds.add(item.id);}
 for(const relation of data.relations)if(relation.projectId!==data.projectId||!observationIds.has(relation.sourceId)||!observationIds.has(relation.targetId))throw new Error("Invalid memory import relation");
 for(const summary of data.summaries)if(summary.projectId!==data.projectId||!sessionIds.has(summary.sessionId))throw new Error("Invalid memory import summary");
 for(const deletion of data.deletions??[]){if(deletion.projectId!==data.projectId||!deletion.id.trim()||!deletion.deletedAt.trim()||observationIds.has(deletion.id))throw new Error("Invalid memory import deletion");if(deletion.mode==="soft"&&(!deletion.item||deletion.item.id!==deletion.id||deletion.item.projectId!==data.projectId||!sessionIds.has(deletion.item.sessionId)))throw new Error("Invalid memory import deletion");if(deletion.mode==="hard"&&deletion.item)throw new Error("Invalid memory import deletion");}
}

export function validateProjectMemoryBackupExport(value:unknown,expectedProjectId:string):MemoryExport{
 if(!record(value)||!exactKeys(value,exportKeys)||value.version!==1||!string(value.projectId,true))throw new ProjectMemoryExportValidationError("invalid-export");
 if(value.projectId!==expectedProjectId)throw new ProjectMemoryExportValidationError("project-mismatch");
 if(!Array.isArray(value.sessions)||!Array.isArray(value.observations)||!Array.isArray(value.relations)||!Array.isArray(value.summaries)||!Array.isArray(value.deletions))throw new ProjectMemoryExportValidationError("invalid-export");
 const projectId=value.projectId;
 const sessions=value.sessions.map(session=>{if(!validSession(session,projectId))throw new ProjectMemoryExportValidationError("invalid-export");return session;});
 const observations=value.observations.map(item=>{if(!validItem(item,projectId))throw new ProjectMemoryExportValidationError("invalid-export");return item;});
 const relations=value.relations.map(relation=>{if(!validRelation(relation,projectId))throw new ProjectMemoryExportValidationError("invalid-export");return relation;});
 const summaries=value.summaries.map(summary=>{if(!validSummary(summary,projectId))throw new ProjectMemoryExportValidationError("invalid-export");return summary;});
 const deletions=value.deletions.map(deletion=>{if(!validDeletion(deletion,projectId))throw new ProjectMemoryExportValidationError("invalid-export");return deletion;});
 const typed:MemoryExport={version:1,projectId,observations,relations,summaries,sessions,deletions};
 try{validateMemoryImport(typed,sessions);}catch{throw new ProjectMemoryExportValidationError("invalid-export");}
 const sessionIds=new Set(sessions.map(session=>session.sessionId));
 if(sessionIds.size!==sessions.length)throw new ProjectMemoryExportValidationError("invalid-export");
 const bySession=new Map(sessions.map(session=>[session.sessionId,session]));
 for(const session of sessions){
  const root=bySession.get(session.rootSessionId);
  if(!root||root.rootSessionId!==root.sessionId||root.parentSessionId!==undefined||session.sessionId!==session.rootSessionId&&session.parentSessionId===undefined||session.parentSessionId!==undefined&&!sessionIds.has(session.parentSessionId)||hasCycle(session.sessionId,bySession))throw new ProjectMemoryExportValidationError("invalid-export");
  if(session.parentSessionId&&bySession.get(session.parentSessionId)?.rootSessionId!==session.rootSessionId)throw new ProjectMemoryExportValidationError("invalid-export");
 }
 const observationIds=new Set(observations.map(item=>item.id));
 if(observationIds.size!==observations.length||observations.some(item=>!sessionIds.has(item.sessionId)))throw new ProjectMemoryExportValidationError("invalid-export");
 const relationIds=new Set(relations.map(relation=>relation.id));
 if(relationIds.size!==relations.length||relations.some(relation=>!observationIds.has(relation.sourceId)||!observationIds.has(relation.targetId)))throw new ProjectMemoryExportValidationError("invalid-export");
 const summarySessions=new Set<string>();
 for(const summary of summaries){if(!sessionIds.has(summary.sessionId)||summarySessions.has(summary.sessionId))throw new ProjectMemoryExportValidationError("invalid-export");summarySessions.add(summary.sessionId);}
 const deletionIds=new Set<string>();
 for(const deletion of deletions){
  if(deletionIds.has(deletion.id)||observationIds.has(deletion.id))throw new ProjectMemoryExportValidationError("invalid-export");deletionIds.add(deletion.id);
  if(deletion.mode==="soft"&&(!deletion.item||!sessionIds.has(deletion.item.sessionId)))throw new ProjectMemoryExportValidationError("invalid-export");
 }
 return typed;
}

function canonicalItem(item:MemoryItem):MemoryItem{return {
 id:item.id,projectId:item.projectId,sessionId:item.sessionId,kind:item.kind,
 ...(item.topic!==undefined?{topic:item.topic}:{}),content:item.content,createdAt:item.createdAt,
 ...(item.pinned!==undefined?{pinned:item.pinned}:{}),...(item.title!==undefined?{title:item.title}:{}),
 ...(item.scope!==undefined?{scope:item.scope}:{}),...(item.toolName!==undefined?{toolName:item.toolName}:{}),
 ...(item.topicKey!==undefined?{topicKey:item.topicKey}:{}),...(item.revisionCount!==undefined?{revisionCount:item.revisionCount}:{}),
 ...(item.duplicateCount!==undefined?{duplicateCount:item.duplicateCount}:{}),...(item.lastSeenAt!==undefined?{lastSeenAt:item.lastSeenAt}:{}),
 ...(item.updatedAt!==undefined?{updatedAt:item.updatedAt}:{})
};}

function canonicalDeletion(deletion:MemoryDeletionMarker):MemoryDeletionMarker{
 if(deletion.mode!=="soft"&&deletion.mode!=="hard")throw new ProjectMemoryExportValidationError("invalid-export");
 return {id:deletion.id,projectId:deletion.projectId,deletedAt:deletion.deletedAt,mode:deletion.mode,...(deletion.item!==undefined?{item:canonicalItem(deletion.item)}:{})};
}

export function canonicalProjectMemoryExport(data:MemoryExport):MemoryExport{
 if(!data.sessions||!data.deletions)throw new ProjectMemoryExportValidationError("invalid-export");
 return {
  version:1,
  projectId:data.projectId,
  observations:data.observations.map(canonicalItem),
  relations:data.relations.map(relation=>({id:relation.id,sourceId:relation.sourceId,targetId:relation.targetId,relation:relation.relation,projectId:relation.projectId,createdAt:relation.createdAt,...(relation.reviewedAt!==undefined?{reviewedAt:relation.reviewedAt}:{})})),
  summaries:data.summaries.map(summary=>({projectId:summary.projectId,sessionId:summary.sessionId,content:summary.content,createdAt:summary.createdAt})),
  sessions:data.sessions.map(session=>({projectId:session.projectId,sessionId:session.sessionId,rootSessionId:session.rootSessionId,...(session.parentSessionId!==undefined?{parentSessionId:session.parentSessionId}:{}),status:session.status})),
  deletions:data.deletions.map(canonicalDeletion)
 };
}
