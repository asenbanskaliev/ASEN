export const REPOSITORY_OPERATION_ACTIONS=["remote_read","issue_create","issue_update","branch_create","push","pr_open","pr_update","label_mutate","merge","force_update"] as const;
export type RepositoryOperationAction=typeof REPOSITORY_OPERATION_ACTIONS[number];
export type MutationAction=Exclude<RepositoryOperationAction,"remote_read">;
export interface RepositoryOperationBinding{readonly host:string;readonly owner:string;readonly repository:string;readonly sessionId:string;readonly actor:string;readonly action:RepositoryOperationAction;}
declare const authorityBrand:unique symbol;
export interface RepositoryOperationAuthority extends RepositoryOperationBinding{readonly [authorityBrand]:true;}
interface AuthorityState{readonly binding:RepositoryOperationBinding;readonly key:string;consumed:boolean;}
const authorities=new WeakMap<object,AuthorityState>();
const liveAuthorities=new Map<string,object>();

function explicit(value:unknown,field:string,separators=false):string{
 if(typeof value!=="string"||!value||value.trim()!==value||/\s/u.test(value)||(separators&&(/[\\/]/u.test(value)||value==="."||value==="..")))throw new Error(`${field} must be an explicit structured value`);
 return value;
}
function normalizedHost(value:unknown):string{
 const raw=explicit(value,"host",true).toLowerCase(),host=raw.endsWith(".")?raw.slice(0,-1):raw;
 if(raw.includes(":")||raw.endsWith("..")||!host.split(".").every(part=>/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(part)))throw new Error("host must be an explicit structured value");
 return host;
}
function exactBinding(input:RepositoryOperationBinding):RepositoryOperationBinding{
 if(typeof input!=="object"||input===null)throw new Error("Binding must be an explicit structured value");
 const action=input.action;
 if(!(REPOSITORY_OPERATION_ACTIONS as readonly unknown[]).includes(action))throw new Error("Action must be supported and exact");
 return Object.freeze({host:normalizedHost(input.host),owner:explicit(input.owner,"owner",true),repository:explicit(input.repository,"repository",true),sessionId:explicit(input.sessionId,"sessionId",true),actor:explicit(input.actor,"actor",true),action});
}
function bindingKey(binding:RepositoryOperationBinding):string{return JSON.stringify([binding.host,binding.owner,binding.repository,binding.sessionId,binding.actor,binding.action]);}
export function authorizeRepositoryOperation(input:RepositoryOperationBinding):RepositoryOperationAuthority{
 const binding=exactBinding(input),key=bindingKey(binding);
 if(liveAuthorities.has(key))throw new Error("A live authority already exists for this binding");
 const authority=Object.freeze({...binding}) as RepositoryOperationAuthority;
 authorities.set(authority,{binding,key,consumed:false});liveAuthorities.set(key,authority);
 return authority;
}
export function isRepositoryOperationAuthority(value:unknown):value is RepositoryOperationAuthority{return typeof value==="object"&&value!==null&&authorities.has(value);}
function matches(left:RepositoryOperationBinding,right:RepositoryOperationBinding):boolean{return left.host===right.host&&left.owner===right.owner&&left.repository===right.repository&&left.sessionId===right.sessionId&&left.actor===right.actor&&left.action===right.action;}
function consume(authority:RepositoryOperationAuthority,noun:string):AuthorityState{
 const state=typeof authority==="object"&&authority!==null?authorities.get(authority):undefined;
 if(!state)throw new Error("Operation requires ASEN-issued authority");
 if(state.consumed)throw new Error(`${noun} authority already consumed`);
 state.consumed=true;if(liveAuthorities.get(state.key)===authority)liveAuthorities.delete(state.key);
 return state;
}
function verifyConsumed(state:AuthorityState,expectedBinding:RepositoryOperationBinding,action:"read"|"mutation"):RepositoryOperationBinding{
 const expected=exactBinding(expectedBinding);
 if(!matches(state.binding,expected))throw new Error("Authority binding mismatch");
 if(action==="read"&&state.binding.action!=="remote_read")throw new Error("Authorized read requires remote_read authority");
 if(action==="mutation"&&state.binding.action==="remote_read")throw new Error("One-attempt execution requires mutation authority");
 return state.binding;
}

export type OperationAttempt={readonly status:"accepted"|"rejected"|"ambiguous";readonly reasonCode?:string};
export type ExactTargetReadBack={readonly state:"intended"|"unchanged"|"drift"|"unconfirmed";readonly reasonCode?:string};
export interface OneAttemptOutcome{readonly classification:"confirmed"|"no_write"|"unknown";readonly operationReason:string;readonly readBackReason:string;}
function reason(value:unknown,fallback:string):string{return typeof value==="string"&&/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(value)?value:value===undefined?fallback:"redacted";}
export async function executeOneAttempt(
 authority:RepositoryOperationAuthority,expectedBinding:RepositoryOperationBinding,
 operation:(binding:RepositoryOperationBinding)=>OperationAttempt|Promise<OperationAttempt>,readBack:(binding:RepositoryOperationBinding)=>ExactTargetReadBack|Promise<ExactTargetReadBack>,
):Promise<OneAttemptOutcome>{
 const frozen=verifyConsumed(consume(authority,"Mutation"),expectedBinding,"mutation");
 let attempt:OperationAttempt;
 try{attempt=await operation(frozen);}catch{attempt={status:"ambiguous",reasonCode:"operation_threw"};}
 let observed:ExactTargetReadBack;
 try{observed=await readBack(frozen);}catch{observed={state:"unconfirmed",reasonCode:"readback_failed"};}
 const operationReason=reason(attempt?.reasonCode,attempt?.status==="rejected"?"authoritative_rejection":attempt?.status==="accepted"?"accepted":"ambiguous_operation");
 const readBackReason=reason(observed?.reasonCode,observed?.state==="intended"?"exact_intended":observed?.state==="unchanged"?"exact_unchanged":observed?.state==="drift"?"state_drift":"unconfirmed");
 const classification=observed?.state==="intended"?"confirmed":attempt?.status==="rejected"&&observed?.state==="unchanged"?"no_write":"unknown";
 return Object.freeze({classification,operationReason,readBackReason});
}
export async function executeAuthorizedRead<T>(authority:RepositoryOperationAuthority,expectedBinding:RepositoryOperationBinding,reader:(binding:RepositoryOperationBinding)=>T|Promise<T>):Promise<T>{
 const frozen=verifyConsumed(consume(authority,"Read"),expectedBinding,"read");
 try{return await reader(frozen);}catch{throw new Error("Authorized read failed");}
}

export type RepositoryPermission="ADMIN"|"MAINTAIN"|"WRITE"|"TRIAGE"|"READ"|"UNVERIFIED";
export interface ProtectedLabelMutationInput{readonly currentLabels:readonly string[];readonly add:readonly string[];readonly remove:readonly string[];readonly protectedLabels:readonly string[];readonly actorPermission:RepositoryPermission;readonly rationale?:string;}
export interface ProtectedLabelMutationPlan{readonly add:readonly string[];readonly remove:readonly string[];readonly expectedFinalLabels:readonly string[];}
const labelKey=(label:string)=>label.toLocaleLowerCase("en-US");
function labels(values:readonly string[],field:string):string[]{
 const normalized=values.map(value=>explicit(value,`${field} label`)),identities=normalized.map(labelKey);
 if(new Set(identities).size!==identities.length)throw new Error(`${field} contains duplicate labels`);
 return normalized;
}
function sortedLabels(values:Iterable<string>):string[]{return [...values].sort((left,right)=>labelKey(left).localeCompare(labelKey(right),"en-US")||left.localeCompare(right,"en-US"));}
export function planProtectedLabelMutation(input:ProtectedLabelMutationInput):ProtectedLabelMutationPlan{
 const current=labels(input.currentLabels,"currentLabels"),add=labels(input.add,"add"),remove=labels(input.remove,"remove"),protectedLabels=labels(input.protectedLabels,"protectedLabels");
 const removed=new Set(remove.map(labelKey)),protectedSet=new Set(protectedLabels.map(labelKey));
 if(add.some(label=>removed.has(labelKey(label))))throw new Error("Label add/remove overlap is not atomic");
 const protectedChange=[...add,...remove].some(label=>protectedSet.has(labelKey(label)));
 if(protectedChange&&!(["ADMIN","MAINTAIN","WRITE"] as readonly RepositoryPermission[]).includes(input.actorPermission))throw new Error("Actor permission does not authorize protected label changes");
 if(add.some(label=>labelKey(label)==="size:exception")&&(!input.rationale||!input.rationale.trim()))throw new Error("size:exception addition requires a nonblank rationale");
 const final=new Map(current.map(label=>[labelKey(label),label]));for(const label of remove)final.delete(labelKey(label));for(const label of add)final.set(labelKey(label),label);
 return Object.freeze({add:Object.freeze(sortedLabels(add)),remove:Object.freeze(sortedLabels(remove)),expectedFinalLabels:Object.freeze(sortedLabels(final.values()))});
}
