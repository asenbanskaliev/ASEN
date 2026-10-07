export interface PublicCommand{group:"core"|"workflow"|"review"|"skills"|"configuration"|"session"|"diagnostics";name:string;implemented:boolean;owner:string}
export const ASEN_COMMAND_CATALOG:readonly PublicCommand[]=[
 {group:"core",name:"asen",implemented:true,owner:"extensions/asen.ts"},
 {group:"workflow",name:"asen-workflow",implemented:true,owner:"src/lifecycle/workflow-selection.ts"},
 {group:"review",name:"asen-review",implemented:true,owner:"src/review/ordinary-review-command.ts"},
 {group:"skills",name:"asen-skill-registry",implemented:true,owner:"extensions/asen.ts"},
 {group:"configuration",name:"asen-profiles",implemented:true,owner:"extensions/asen.ts"},
 {group:"configuration",name:"asen-customize",implemented:false,owner:"ECO-14"},
 {group:"configuration",name:"asen-commands",implemented:true,owner:"extensions/asen.ts"},
 {group:"session",name:"asen-changes",implemented:true,owner:"extensions/asen.ts"},
 {group:"session",name:"asen-agents",implemented:true,owner:"extensions/asen.ts"},
 {group:"session",name:"asen-history",implemented:false,owner:"ECO-12"},
 {group:"session",name:"asen-usage",implemented:false,owner:"ECO-13"},
 {group:"diagnostics",name:"asen-status",implemented:true,owner:"extensions/asen.ts"},
 {group:"diagnostics",name:"asen-doctor",implemented:true,owner:"extensions/asen.ts"},
 {group:"diagnostics",name:"asen-authority-status",implemented:true,owner:"extensions/authority.ts"}
] as const;
export function implementedCommands(){return ASEN_COMMAND_CATALOG.filter(c=>c.implemented).map(c=>c.name);}
export function missingCommands(){return ASEN_COMMAND_CATALOG.filter(c=>!c.implemented).map(c=>c.name);}
