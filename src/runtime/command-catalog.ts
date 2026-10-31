export interface PublicCommand{group:"core"|"workflow"|"review"|"skills"|"configuration"|"session"|"memory"|"diagnostics";name:string;implemented:boolean;owner:string}
export const ASEN_COMMAND_CATALOG:readonly PublicCommand[]=[
 {group:"core",name:"asen",implemented:true,owner:"extensions/asen.ts"},
 {group:"workflow",name:"asen-workflow",implemented:true,owner:"src/lifecycle/workflow-selection.ts"},
 {group:"workflow",name:"asen-route",implemented:true,owner:"extensions/asen.ts"},
 {group:"workflow",name:"asen-plan",implemented:true,owner:"extensions/asen.ts"},
 {group:"review",name:"asen-review",implemented:true,owner:"src/review/ordinary-review-command.ts"},
 {group:"skills",name:"asen-skill-registry",implemented:true,owner:"extensions/asen.ts"},
 {group:"configuration",name:"asen-profiles",implemented:true,owner:"extensions/asen.ts"},
 {group:"configuration",name:"asen-persona",implemented:true,owner:"extensions/asen.ts"},
 {group:"configuration",name:"asen-customize",implemented:true,owner:"extensions/asen.ts"},
 {group:"configuration",name:"asen-telemetry",implemented:true,owner:"extensions/asen.ts"},
 {group:"session",name:"asen-palette",implemented:true,owner:"extensions/asen.ts"},
 {group:"configuration",name:"asen-commands",implemented:true,owner:"extensions/asen.ts"},
 {group:"session",name:"asen-changes",implemented:true,owner:"extensions/asen.ts"},
 {group:"session",name:"asen-agents",implemented:true,owner:"extensions/asen.ts"},
 {group:"session",name:"asen-todos",implemented:true,owner:"extensions/asen.ts"},
 {group:"session",name:"asen-history",implemented:true,owner:"extensions/asen.ts"},
 {group:"session",name:"asen-usage",implemented:true,owner:"extensions/asen.ts"},
 {group:"session",name:"asen-stats",implemented:true,owner:"extensions/asen.ts"},
 {group:"memory",name:"asen-memory",implemented:true,owner:"extensions/asen.ts"},
 {group:"diagnostics",name:"asen-status",implemented:true,owner:"extensions/asen.ts"},
 {group:"diagnostics",name:"asen-doctor",implemented:true,owner:"extensions/asen.ts"},
 {group:"diagnostics",name:"asen-authority-status",implemented:true,owner:"extensions/authority.ts"}
] as const;
export function implementedCommands(){return ASEN_COMMAND_CATALOG.filter(c=>c.implemented).map(c=>c.name);}
export function missingCommands(){return ASEN_COMMAND_CATALOG.filter(c=>!c.implemented).map(c=>c.name);}
