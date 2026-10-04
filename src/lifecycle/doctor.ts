import type { MemoryExport, MemoryStore } from "../memory/types.js";

export interface DoctorCheck { name: string; ok: boolean; detail: string; }
export interface DoctorDeps { memory?: MemoryStore; gitAvailable: boolean; registryAvailable: boolean; piAvailable: boolean; }

export function runDoctor(deps: DoctorDeps): DoctorCheck[] {
  return [
    {name:"Pi",ok:deps.piAvailable,detail:deps.piAvailable?"available":"not detected"},
    {name:"Git",ok:deps.gitAvailable,detail:deps.gitAvailable?"available":"not detected"},
    {name:"Registry",ok:deps.registryAvailable,detail:deps.registryAvailable?"available":"missing"},
    {name:"Memory",ok:Boolean(deps.memory),detail:deps.memory?"configured":"not configured"},
    ...(deps.memory?[(()=>{const result=deps.memory!.integrityCheck();return {name:"Memory integrity",ok:result.ok,detail:result.detail};})()]:[])
  ];
}

export interface MemoryImportPreview {projectId:string;observations:number;relations:number;summaries:number;conflicts:string[];}
export function previewMemoryImport(store:MemoryStore,data:MemoryExport):MemoryImportPreview{
 if(data.version!==1||!data.projectId.trim())throw new Error("Unsupported memory export");
 const conflicts=data.observations.filter(item=>{const current=store.get(item.id);return Boolean(current&&current.projectId!==data.projectId);}).map(item=>item.id);
 return {projectId:data.projectId,observations:data.observations.length,relations:data.relations.length,summaries:data.summaries.length,conflicts};
}
export function assertMemoryImportSafe(preview:MemoryImportPreview):void{if(preview.conflicts.length)throw new Error("Memory import refused: identity conflicts");}
