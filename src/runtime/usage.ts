export interface UsageSnapshot{sessions:number;commands:number;agentRuns:number;blockedToolAttempts:number}
export interface TelemetryConsent{enabled:boolean;previewRequired:true}
export function emptyUsage():UsageSnapshot{return {sessions:0,commands:0,agentRuns:0,blockedToolAttempts:0};}
export function incrementUsage(value:UsageSnapshot,key:keyof UsageSnapshot):UsageSnapshot{return {...value,[key]:value[key]+1};}
export function telemetryPreview(value:UsageSnapshot):Readonly<UsageSnapshot>{return Object.freeze({...value});}
export function maySendTelemetry(consent:TelemetryConsent|undefined,previewAccepted:boolean):boolean{return consent?.enabled===true&&consent.previewRequired===true&&previewAccepted===true;}
