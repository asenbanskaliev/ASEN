import type { MemoryStore } from "../memory/types.js";

export interface DoctorCheck { name: string; ok: boolean; detail: string; }
export interface DoctorDeps { memory?: MemoryStore; gitAvailable: boolean; registryAvailable: boolean; piAvailable: boolean; }

export function runDoctor(deps: DoctorDeps): DoctorCheck[] {
  return [
    {name:"Pi",ok:deps.piAvailable,detail:deps.piAvailable?"available":"not detected"},
    {name:"Git",ok:deps.gitAvailable,detail:deps.gitAvailable?"available":"not detected"},
    {name:"Registry",ok:deps.registryAvailable,detail:deps.registryAvailable?"available":"missing"},
    {name:"Memory",ok:Boolean(deps.memory),detail:deps.memory?"configured":"not configured"}
  ];
}
