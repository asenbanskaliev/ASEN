import path from "node:path";
import type {AsenHomeMode,AsenHomeSource} from "./launcher.js";

export const PROJECT_MEMORY_BACKUP_PREVIEW_SCHEMA="asen.project-memory-backup-preview/v1" as const;

export interface ProjectMemoryBackupPreviewRequest{
 projectId:string;
 destination:string;
 launcherDataHome:{mode:AsenHomeMode;dir:string;source:AsenHomeSource};
}

export interface ProjectMemoryBackupPreviewReport{
 readonly schema:typeof PROJECT_MEMORY_BACKUP_PREVIEW_SCHEMA;
 readonly requested:Readonly<{projectId:string;destination:string}>;
 readonly launcherDataHome:Readonly<{mode:AsenHomeMode;dir:string;source:AsenHomeSource}>;
 readonly memorySource:"not-resolved";
 readonly mechanism:Readonly<{export:"MemoryStore.exportProject";backup:"createProjectMemoryBackup"}>;
 readonly excluded:readonly string[];
 readonly unconsented:readonly string[];
 readonly unsupported:readonly string[];
 readonly executable:false;
 readonly authorized:false;
 readonly storeAccess:"not-run";
 readonly filesystemMutation:"not-run";
 readonly backupCreated:false;
}

const CONTROLS=/[\u0000-\u001f\u007f-\u009f]/u;

function validProjectId(value:string):boolean{return value.length<=256&&value.trim().length>0&&!CONTROLS.test(value);}
function validDestination(value:string):boolean{return value.length<=4096&&value.trim().length>0&&!CONTROLS.test(value)&&(path.posix.isAbsolute(value)||(path.win32.isAbsolute(value)&&path.win32.parse(value).root.length>1));}
function deepFreeze<T>(value:T):Readonly<T>{
 if(value&&typeof value==="object"){
  for(const child of Object.values(value as Record<string,unknown>))deepFreeze(child);
  Object.freeze(value);
 }
 return value;
}

export function createProjectMemoryBackupPreview(request:ProjectMemoryBackupPreviewRequest):ProjectMemoryBackupPreviewReport{
 if(!validProjectId(request.projectId)||!validDestination(request.destination))throw new TypeError("Invalid project-memory backup preview request");
 const report:ProjectMemoryBackupPreviewReport={
  schema:PROJECT_MEMORY_BACKUP_PREVIEW_SCHEMA,
  requested:{projectId:request.projectId,destination:request.destination},
  launcherDataHome:{mode:request.launcherDataHome.mode,dir:request.launcherDataHome.dir,source:request.launcherDataHome.source},
  memorySource:"not-resolved",
  mechanism:{export:"MemoryStore.exportProject",backup:"createProjectMemoryBackup"},
  excluded:["telemetry-consent","pending-todo-state","agent-state","candidate-authority","write-authority","task-agent-links-as-authority","locks","receipts","review-results","grants","credentials","pi-and-custom-homes"],
  unconsented:["history","profiles"],
  unsupported:["workspace","usage","whole-home-backup","live-restore"],
  executable:false,
  authorized:false,
  storeAccess:"not-run",
  filesystemMutation:"not-run",
  backupCreated:false,
 };
 return deepFreeze(report) as ProjectMemoryBackupPreviewReport;
}
