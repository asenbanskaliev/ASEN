import path from "node:path";
export type ActorKind="user"|"agent"|"system";
export interface WorkspaceChange{path:string;actor:{kind:ActorKind;id:string};sessionId:string;projectId:string;worktree:string;operation:"create"|"modify"|"delete";at:string}
function safeText(v:string,label:string){if(!v||/[\u0000-\u001f\u007f]/.test(v))throw new Error(`Invalid ${label}`);return v;}
export function recordWorkspaceChange(input:WorkspaceChange):WorkspaceChange{if(!["user","agent","system"].includes(input.actor.kind))throw new Error("Invalid actor kind");safeText(input.actor.id,"actor");safeText(input.sessionId,"session");safeText(input.projectId,"project");if(!["create","modify","delete"].includes(input.operation))throw new Error("Invalid workspace operation");if(typeof input.path!=="string"||!input.path.trim())throw new Error("Invalid workspace path");if(!path.isAbsolute(input.worktree))throw new Error("Worktree must be absolute");const portable=input.path.replace(/\\/g,"/"),rel=path.posix.normalize(portable);if(path.posix.isAbsolute(rel)||path.win32.isAbsolute(input.path)||rel==="."||rel===".."||rel.startsWith("../"))throw new Error("Change path escapes worktree");if(!Number.isFinite(Date.parse(input.at)))throw new Error("Invalid timestamp");return structuredClone({...input,path:rel,worktree:path.normalize(input.worktree)});}
export function groupChanges(changes:readonly WorkspaceChange[]){const byActor=new Map<string,WorkspaceChange[]>();for(const raw of changes){const c=recordWorkspaceChange(raw),key=`${c.actor.kind}:${c.actor.id}`;byActor.set(key,[...(byActor.get(key)??[]),c]);}return byActor;}
export function visibleWorkspaceRows(changes:readonly WorkspaceChange[],width=100):string[]{const max=Math.max(20,width),rows:string[]=[];for(const c of changes){const actor=`${c.actor.kind}:${c.actor.id}`,prefix=`${c.operation.padEnd(6)} ${actor} `;const room=Math.max(4,max-prefix.length),p=c.path.length>room?"…"+c.path.slice(-(room-1)):c.path;rows.push((prefix+p).slice(0,max));}return rows;}

export interface PotentialWorkspaceConflict{path:string;earlier:WorkspaceChange;later:WorkspaceChange}
/**
 * Conservatively flags a same-session path touched by different actors. The append-only
 * attribution log does not contain file contents, so this is a review signal, not proof
 * of a lost update or a resolution decision. A later write never silently clears it.
 */
export function findPotentialWorkspaceConflicts(changes:readonly WorkspaceChange[]):PotentialWorkspaceConflict[]{
 const latest=new Map<string,WorkspaceChange>(),conflicts=new Map<string,PotentialWorkspaceConflict>();
 for(const raw of changes){
  const change=recordWorkspaceChange(raw),previous=latest.get(change.path);
  if(previous&&(previous.actor.kind!==change.actor.kind||previous.actor.id!==change.actor.id))conflicts.set(change.path,{path:change.path,earlier:previous,later:change});
  latest.set(change.path,change);
 }
 return [...conflicts.values()].map(conflict=>structuredClone(conflict));
}
export function visibleWorkspaceConflictRows(conflicts:readonly PotentialWorkspaceConflict[],width=100):string[]{
 const max=Math.max(20,width),rows:string[]=[];
 for(const conflict of conflicts){
  const actors=`${conflict.earlier.actor.kind}:${conflict.earlier.actor.id} -> ${conflict.later.actor.kind}:${conflict.later.actor.id}`;
  const prefix=`potential conflict ${actors} `,room=Math.max(4,max-prefix.length),p=conflict.path.length>room?"…"+conflict.path.slice(-(room-1)):conflict.path;
  rows.push((prefix+p).slice(0,max));
 }
 return rows;
}
