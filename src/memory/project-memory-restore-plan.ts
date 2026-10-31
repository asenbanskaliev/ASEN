const SCHEMA="asen.project-memory-restore-plan/v1";
const MODE="replace-dedicated-project-store";
const MAX_PATH_LENGTH=4096;
const MAX_TEXT_LENGTH=256;
const MAX_LIST_LENGTH=64;

const UNCONDITIONAL_BLOCKERS=[
 "unverified-evidence",
 "memory-lease-missing",
 "pre-effect-backup-unproved",
 "rollback-unproved",
 "rebind-unproved",
 "human-confirmation-required",
] as const;

export type ProjectMemoryRestoreBlocker=
 |"invalid-request"
 |"same-path"
 |"target-identity-unverified"
 |"target-ownership-unverified"
 |"target-lifecycle-active"
 |"target-lifecycle-unverified"
 |"active-bindings-present"
 |"foreign-projects-present"
 |"session-id-collision"
 |"observation-id-collision"
 |"relation-id-collision"
 |"tombstone-id-collision"
 |"stage-wal-present"
 |"stage-wal-unknown"
 |"stage-shm-present"
 |"stage-shm-unknown"
 |"target-wal-present"
 |"target-wal-unknown"
 |"target-shm-present"
 |"target-shm-unknown"
 |typeof UNCONDITIONAL_BLOCKERS[number];

export interface ProjectMemoryRestorePlanResult {
 schema:typeof SCHEMA;
 status:"blocked";
 executable:false;
 authorized:false;
 revalidationRequired:true;
 blockers:readonly ProjectMemoryRestoreBlocker[];
}

type StoreKind="dedicated-project-store"|"shared-project-store"|"unknown";
type LifecycleLabel="quiescent"|"active"|"unknown";
type SidecarState="absent"|"present"|"unknown";
interface PhysicalTargetIdentity {kind:StoreKind;projectId:string;dev:number;ino:number;birthtimeMs:number;}
interface CollisionFacts {sessionIds:string[];observationIds:string[];relationIds:string[];tombstoneIds:string[];}
interface SidecarFacts {stage:{wal:SidecarState;shm:SidecarState};target:{wal:SidecarState;shm:SidecarState};}
interface ValidRequest {
 mode:typeof MODE;
 stagedDatabasePath:string;
 targetDatabasePath:string;
 expectedProjectId:string;
 stagedDigest:string;
 stagingReceiptReference:string;
 targetObservedIdentity:PhysicalTargetIdentity;
 targetOwnershipLabel:StoreKind;
 targetLifecycleLabel:LifecycleLabel;
 activeBindingCount:number;
 foreignProjectIds:string[];
 collisions:CollisionFacts;
 sidecars:SidecarFacts;
}

function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value);}
function isBoundedText(value:unknown):value is string{return typeof value==="string"&&value.length>0&&value.length<=MAX_TEXT_LENGTH&&!/[\u0000-\u001f\u007f]/u.test(value);}
function isAbsoluteLexicalPath(value:unknown):value is string{
 return typeof value==="string"&&value.length>0&&value.length<=MAX_PATH_LENGTH&&!/[\u0000-\u001f\u007f]/u.test(value)&&(value.startsWith("/")||/^[A-Za-z]:[\\/]/u.test(value));
}
function isSafeInteger(value:unknown):value is number{return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0;}
function isStringList(value:unknown):value is string[]{return Array.isArray(value)&&value.length<=MAX_LIST_LENGTH&&value.every(isBoundedText);}
function isStoreKind(value:unknown):value is StoreKind{return value==="dedicated-project-store"||value==="shared-project-store"||value==="unknown";}
function isLifecycle(value:unknown):value is LifecycleLabel{return value==="quiescent"||value==="active"||value==="unknown";}
function isSidecarState(value:unknown):value is SidecarState{return value==="absent"||value==="present"||value==="unknown";}
function isSidecarPair(value:unknown):value is {wal:SidecarState;shm:SidecarState}{return isRecord(value)&&isSidecarState(value.wal)&&isSidecarState(value.shm);}
function isPhysicalIdentity(value:unknown):value is PhysicalTargetIdentity{
 return isRecord(value)&&isStoreKind(value.kind)&&isBoundedText(value.projectId)&&isSafeInteger(value.dev)&&isSafeInteger(value.ino)&&isSafeInteger(value.birthtimeMs);
}
function isCollisionFacts(value:unknown):value is CollisionFacts{
 return isRecord(value)&&isStringList(value.sessionIds)&&isStringList(value.observationIds)&&isStringList(value.relationIds)&&isStringList(value.tombstoneIds);
}
function isSidecarFacts(value:unknown):value is SidecarFacts{return isRecord(value)&&isSidecarPair(value.stage)&&isSidecarPair(value.target);}
function isValidRequest(value:unknown):value is ValidRequest{
 if(!isRecord(value))return false;
 return value.mode===MODE
  &&isAbsoluteLexicalPath(value.stagedDatabasePath)
  &&isAbsoluteLexicalPath(value.targetDatabasePath)
  &&isBoundedText(value.expectedProjectId)
  &&typeof value.stagedDigest==="string"&&/^sha256:[0-9a-f]{64}$/u.test(value.stagedDigest)
  &&isBoundedText(value.stagingReceiptReference)
  &&isPhysicalIdentity(value.targetObservedIdentity)
  &&isStoreKind(value.targetOwnershipLabel)
  &&isLifecycle(value.targetLifecycleLabel)
  &&isSafeInteger(value.activeBindingCount)
  &&isStringList(value.foreignProjectIds)
  &&isCollisionFacts(value.collisions)
  &&isSidecarFacts(value.sidecars);
}
function frozenResult(conditional:readonly ProjectMemoryRestoreBlocker[]):ProjectMemoryRestorePlanResult{
 const blockers=Object.freeze([...conditional,...UNCONDITIONAL_BLOCKERS]);
 return Object.freeze({schema:SCHEMA,status:"blocked",executable:false,authorized:false,revalidationRequired:true,blockers});
}
function sidecarBlocker(location:"stage"|"target",sidecar:"wal"|"shm",state:SidecarState):ProjectMemoryRestoreBlocker|null{
 if(state==="absent")return null;
 if(location==="stage"){
  if(sidecar==="wal")return state==="present"?"stage-wal-present":"stage-wal-unknown";
  return state==="present"?"stage-shm-present":"stage-shm-unknown";
 }
 if(sidecar==="wal")return state==="present"?"target-wal-present":"target-wal-unknown";
 return state==="present"?"target-shm-present":"target-shm-unknown";
}

export function planProjectMemoryRestore(input:unknown):ProjectMemoryRestorePlanResult{
 try{
  if(!isValidRequest(input))return frozenResult(["invalid-request"]);
  const blockers:ProjectMemoryRestoreBlocker[]=[];
  if(input.stagedDatabasePath===input.targetDatabasePath)blockers.push("same-path");
  if(input.targetObservedIdentity.kind!=="dedicated-project-store"||input.targetObservedIdentity.projectId!==input.expectedProjectId)blockers.push("target-identity-unverified");
  if(input.targetOwnershipLabel!=="dedicated-project-store")blockers.push("target-ownership-unverified");
  if(input.targetLifecycleLabel==="active")blockers.push("target-lifecycle-active");
  else if(input.targetLifecycleLabel!=="quiescent")blockers.push("target-lifecycle-unverified");
  if(input.activeBindingCount>0)blockers.push("active-bindings-present");
  if(input.foreignProjectIds.length>0)blockers.push("foreign-projects-present");
  if(input.collisions.sessionIds.length>0)blockers.push("session-id-collision");
  if(input.collisions.observationIds.length>0)blockers.push("observation-id-collision");
  if(input.collisions.relationIds.length>0)blockers.push("relation-id-collision");
  if(input.collisions.tombstoneIds.length>0)blockers.push("tombstone-id-collision");
  for(const [location,sidecar] of [["stage","wal"],["stage","shm"],["target","wal"],["target","shm"]] as const){
   const blocker=sidecarBlocker(location,sidecar,input.sidecars[location][sidecar]);
   if(blocker)blockers.push(blocker);
  }
  return frozenResult(blockers);
 }catch{return frozenResult(["invalid-request"]);}
}
