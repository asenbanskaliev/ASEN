import {clearUsageFile,readUsageFile,updateUsageFile} from "./usage-store.js";
import {telemetryPreview} from "./usage.js";

export interface UsageCommandContext{storePath:string;hasUI:boolean;confirm?:(title:string,message:string)=>Promise<boolean>}
const usage="Usage: /asen-usage [show|reset|telemetry preview|telemetry enable|telemetry disable].";
export async function runUsageCommand(args:string,context:UsageCommandContext):Promise<string>{
 const [action,subaction]=args.trim().split(/\s+/u);if(!action||action==="show")return JSON.stringify((await readUsageFile(context.storePath)).snapshot,null,2);
 if(action==="reset"){
  if(!context.hasUI||!context.confirm||!await context.confirm("Delete local usage?","This clears local usage counters and revokes telemetry consent."))return "Usage data was not deleted.";
  await clearUsageFile(context.storePath);return "Local usage data deleted; telemetry consent was revoked.";
 }
 if(action!=="telemetry"||!subaction)return usage;
 let current=await readUsageFile(context.storePath);
 if(subaction==="preview")return `Local-only telemetry preview (nothing sent):\n${JSON.stringify(telemetryPreview(current.snapshot),null,2)}`;
 if(subaction==="disable"){
  current=await updateUsageFile(context.storePath,value=>({...value,revision:value.revision+1,telemetryConsent:{enabled:false,previewRequired:true}}));return "Telemetry consent disabled. ASEN has no telemetry transport configured.";
 }
 if(subaction==="enable"){
  if(!context.hasUI||!context.confirm)return "Explicit telemetry consent requires an interactive confirmation; no data was sent.";
  const preview=JSON.stringify(telemetryPreview(current.snapshot),null,2);
  if(!await context.confirm("Review optional telemetry preview",`No data is sent by this action. The current local counters are:\n${preview}\n\nEnable consent for a future one-shot transport?`))return "Telemetry consent remains disabled; no data was sent.";
  await updateUsageFile(context.storePath,value=>({...value,revision:value.revision+1,telemetryConsent:{enabled:true,previewRequired:true}}));return "Telemetry consent recorded. No data was sent; no telemetry transport is configured.";
 }
 return usage;
}
