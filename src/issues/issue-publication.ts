import {createHash} from "node:crypto";
import {duplicateDecisionMatches,isDuplicateDecision,type DuplicateDecision,type MaterializedIssue} from "./issue-preparation.js";
import {executeAuthorizedRead,executeOneAttempt,planProtectedLabelMutation,type OperationAttempt,type RepositoryOperationAuthority,type RepositoryOperationBinding,type RepositoryPermission} from "../repository/operation-policy.js";

export interface IssueSnapshot{readonly url:string;readonly title:string;readonly body:string;readonly labels:readonly string[];readonly candidateIdentity:string;}
export interface IssuePublicationPayload{readonly title:string;readonly body:string;readonly labels:readonly string[];readonly candidateIdentity:string;}
export interface IssuePublicationPort{
 create(binding:RepositoryOperationBinding,payload:IssuePublicationPayload):OperationAttempt|Promise<OperationAttempt>;
 readCreated(binding:RepositoryOperationBinding,target:IssuePublicationPayload):readonly IssueSnapshot[]|Promise<readonly IssueSnapshot[]>;
 readIssue(binding:RepositoryOperationBinding,issueUrl:string):IssueSnapshot|null|Promise<IssueSnapshot|null>;
 mutateLabels(binding:RepositoryOperationBinding,input:Readonly<{issueUrl:string;baselineSnapshotHash:string;add:readonly string[];remove:readonly string[]}>):OperationAttempt|Promise<OperationAttempt>;
}
export interface IssuePublicationInput{readonly issue:MaterializedIssue;readonly duplicateDecision:DuplicateDecision;readonly binding:RepositoryOperationBinding;readonly remoteLabels:readonly string[];readonly protectedLabels:readonly string[];readonly actorPermission:RepositoryPermission;readonly sizeExceptionRationale?:string;}
export interface IssuePublicationPlan{readonly binding:RepositoryOperationBinding;readonly title:string;readonly body:string;readonly labels:readonly string[];readonly candidateIdentity:string;readonly payload:IssuePublicationPayload;}
export type IssuePublicationResult=Readonly<{classification:"confirmed";operationReason:string;readBackReason:string;issueUrl:string}>|Readonly<{classification:"no_write"|"unknown";operationReason:string;readBackReason:string}>;
export interface IssueLabelMutationInput{readonly add:readonly string[];readonly remove:readonly string[];readonly protectedLabels:readonly string[];readonly actorPermission:RepositoryPermission;readonly rationale?:string;}
export interface IssueLabelMutationPlan{readonly binding:RepositoryOperationBinding;readonly issueUrl:string;readonly candidateIdentity:string;readonly title:string;readonly body:string;readonly baselineSnapshotHash:string;readonly add:readonly string[];readonly remove:readonly string[];readonly expectedFinalLabels:readonly string[];}
export type IssueLabelMutationResult=Readonly<{classification:"confirmed"|"no_write"|"unknown";operationReason:string;readBackReason:string}>;

const publicationPlans=new WeakSet<object>(),mutationPlans=new WeakSet<object>(),consumedPublicationPlans=new WeakSet<object>(),consumedMutationPlans=new WeakSet<object>();
const confirmedPublications=new WeakMap<object,{plan:IssuePublicationPlan;issueUrl:string}>();
const fold=(value:string)=>value.normalize("NFC").toLocaleLowerCase("en-US");
const digest=(value:unknown)=>`sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const validIdentity=(value:unknown):value is string=>typeof value==="string"&&/^sha256:[a-f0-9]{64}$/u.test(value);
const validText=(value:unknown):value is string=>typeof value==="string"&&value.length>0;
function checkedLabels(values:readonly string[],field:string):string[]{
 if(!Array.isArray(values)||values.some(value=>typeof value!=="string"||!value||value.trim()!==value))throw new Error(`${field} labels are malformed`);
 const copy=[...values],keys=copy.map(fold);if(new Set(keys).size!==keys.length)throw new Error(field==="remote inventory"?"Remote label inventory is ambiguous":`${field} contains duplicate labels`);return copy;
}
function frozenBinding(input:RepositoryOperationBinding,action:RepositoryOperationBinding["action"]):RepositoryOperationBinding{
 const expected=["host","owner","repository","sessionId","actor","action"] as const;
 if(input===null||typeof input!=="object"||Array.isArray(input)||Object.getPrototypeOf(input)!==Object.prototype)throw new Error(`Publication requires exact ${action} binding`);
 const keys=Reflect.ownKeys(input);if(keys.length!==expected.length||keys.some(key=>typeof key!=="string"||!expected.includes(key as typeof expected[number]))||expected.some(key=>!Object.hasOwn(input,key)))throw new Error(`Publication requires exact ${action} binding`);
 const values:Record<string,unknown>={};for(const key of expected){const descriptor=Object.getOwnPropertyDescriptor(input,key);if(!descriptor?.enumerable||!("value" in descriptor))throw new Error(`Publication requires exact ${action} binding`);values[key]=descriptor.value;}
 if(values.action!==action)throw new Error(`Publication requires exact ${action} binding`);
 const structured=(value:unknown,name:string):string=>{if(typeof value!=="string"||!value||value.trim()!==value||/[\s/\\]/u.test(value)||[...value].some(character=>{const code=character.codePointAt(0)!;return code<=31||code>=127&&code<=159;})||value==="."||value==="..")throw new Error(`${name} binding is malformed`);return value;};
 const rawHost=structured(values.host,"host").toLowerCase();if(rawHost.includes(":")||rawHost.includes("@")||rawHost.endsWith(".."))throw new Error("host binding is malformed");const host=rawHost.endsWith(".")?rawHost.slice(0,-1):rawHost;if(!host||!host.split(".").every(part=>/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(part)))throw new Error("host binding is malformed");
 return Object.freeze({host,owner:structured(values.owner,"owner"),repository:structured(values.repository,"repository"),sessionId:structured(values.sessionId,"sessionId"),actor:structured(values.actor,"actor"),action});
}
function sameRepository(left:RepositoryOperationBinding,right:RepositoryOperationBinding):boolean{return left.host===right.host&&left.owner===right.owner&&left.repository===right.repository&&left.sessionId===right.sessionId&&left.actor===right.actor;}
function sameBinding(left:RepositoryOperationBinding,right:RepositoryOperationBinding):boolean{return sameRepository(left,right)&&left.action===right.action;}
function canonicalIssueUrl(value:unknown,binding:RepositoryOperationBinding):string|null{
 if(typeof value!=="string")return null;let url:URL;try{url=new URL(value);}catch{return null;}
 if(url.protocol!=="https:"||url.username||url.password||url.port||url.search||url.hash||url.hostname!==binding.host)return null;
 const match=/^\/([^/]+)\/([^/]+)\/issues\/([1-9][0-9]*)$/u.exec(url.pathname);if(!match||match[1]!==binding.owner||match[2]!==binding.repository)return null;
 const canonical=`https://${binding.host}/${binding.owner}/${binding.repository}/issues/${match[3]}`;return value===canonical?canonical:null;
}
function exactArray(value:unknown):unknown[]|null{
 try{if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)return null;const keys=Reflect.ownKeys(value),expected=[...Array(value.length).keys()].map(String);if(keys.some(key=>typeof key!=="string"||(key!=="length"&&!expected.includes(key)))||expected.some(key=>!Object.hasOwn(value,key)))return null;const result:unknown[]=[];for(const key of expected){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!("value" in descriptor))return null;result.push(descriptor.value);}const length=Object.getOwnPropertyDescriptor(value,"length");return length&&!length.enumerable&&"value" in length?result:null;}catch{return null;}
}
function exactSnapshot(value:unknown,binding:RepositoryOperationBinding):IssueSnapshot|null{
 try{if(value===null||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return null;const expected=["url","title","body","labels","candidateIdentity"],keys=Reflect.ownKeys(value);if(keys.length!==expected.length||keys.some(key=>typeof key!=="string"||!expected.includes(key))||expected.some(key=>!Object.hasOwn(value,key)))return null;const record:Record<string,unknown>={};for(const key of expected){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!("value" in descriptor))return null;record[key]=descriptor.value;}const labels=exactArray(record.labels);if(!canonicalIssueUrl(record.url,binding)||!validText(record.title)||typeof record.body!=="string"||!validIdentity(record.candidateIdentity)||!labels||labels.some(label=>typeof label!=="string"))return null;const checked=checkedLabels(labels as string[],"observed");return {url:record.url as string,title:record.title as string,body:record.body,labels:checked,candidateIdentity:record.candidateIdentity};}catch{return null;}
}
function sameLabels(left:readonly string[],right:readonly string[]):boolean{
 try{const a=checkedLabels(left,"observed").map(fold).sort(),b=checkedLabels(right,"expected").map(fold).sort();return a.length===b.length&&a.every((value,index)=>value===b[index]);}catch{return false;}
}
function materializedIsAuthentic(issue:MaterializedIssue):boolean{
 if(!issue||!Object.isFrozen(issue)||!Object.isFrozen(issue.labels)||!validText(issue.formId)||!validText(issue.title)||typeof issue.body!=="string"||!validIdentity(issue.candidateIdentity))return false;
 try{return issue.candidateIdentity===digest({formId:issue.formId,title:issue.title,body:issue.body,labels:checkedLabels(issue.labels,"materialized")});}catch{return false;}
}
function snapshotHash(snapshot:IssueSnapshot,binding:RepositoryOperationBinding):string|null{
 const exact=exactSnapshot(snapshot,binding);if(!exact)return null;return digest({url:exact.url,title:exact.title,body:exact.body,candidateIdentity:exact.candidateIdentity,labels:[...exact.labels].map(fold).sort()});
}
function snapshotMatches(snapshot:IssueSnapshot,plan:Pick<IssuePublicationPlan,"binding"|"title"|"body"|"labels"|"candidateIdentity">):string|null{
 const exact=exactSnapshot(snapshot,plan.binding);return exact&&exact.title===plan.title&&exact.body===plan.body&&exact.candidateIdentity===plan.candidateIdentity&&sameLabels(exact.labels,plan.labels)?exact.url:null;
}
function consumePlan(plan:unknown,issued:WeakSet<object>,consumed:WeakSet<object>,name:string):void{if(typeof plan!=="object"||plan===null||!issued.has(plan))throw new Error(`${name} requires an opaque prepared plan`);if(consumed.has(plan))throw new Error(`${name} plan already consumed`);consumed.add(plan);}

export function prepareIssuePublication(input:IssuePublicationInput):IssuePublicationPlan{
 if(!materializedIsAuthentic(input.issue))throw new Error("Publication requires exact frozen materialized issue identity");
 if(!isDuplicateDecision(input.duplicateDecision)||input.duplicateDecision.status!=="proceed"||input.duplicateDecision.reason!=="all_not_duplicate"||input.duplicateDecision.duplicateIssue!==null)throw new Error("Publication requires genuine proceed duplicate decision");
 const binding=frozenBinding(input.binding,"issue_create");if(!duplicateDecisionMatches(input.duplicateDecision,{repository:`${binding.host}/${binding.owner}/${binding.repository}`,candidateIdentity:input.issue.candidateIdentity}))throw new Error("Publication duplicate decision does not match exact repository and candidate identity");
 const inventory=checkedLabels(input.remoteLabels,"remote inventory"),declared=checkedLabels(input.issue.labels,"declared"),remote=new Map<string,string>();
 for(const label of inventory){const key=fold(label);if(remote.has(key))throw new Error("Remote label inventory is ambiguous");remote.set(key,label);}
 const labels=declared.map(label=>{const canonical=remote.get(fold(label));if(!canonical)throw new Error("Declared label does not exist in exact remote label inventory");return canonical;});
 planProtectedLabelMutation({currentLabels:[],add:labels,remove:[],protectedLabels:input.protectedLabels,actorPermission:input.actorPermission,...(input.sizeExceptionRationale===undefined?{}:{rationale:input.sizeExceptionRationale})});
 const frozenLabels=Object.freeze(labels),payload=Object.freeze({title:input.issue.title,body:input.issue.body,labels:frozenLabels,candidateIdentity:input.issue.candidateIdentity}),plan=Object.freeze({binding,title:payload.title,body:payload.body,labels:frozenLabels,candidateIdentity:payload.candidateIdentity,payload});publicationPlans.add(plan);return plan;
}

export async function executeIssuePublication(plan:IssuePublicationPlan,authority:RepositoryOperationAuthority,expectedBinding:RepositoryOperationBinding,port:IssuePublicationPort):Promise<IssuePublicationResult>{
 consumePlan(plan,publicationPlans,consumedPublicationPlans,"Publication");if(!sameBinding(plan.binding,expectedBinding)||expectedBinding.action!=="issue_create")throw new Error("Publication authority binding mismatch");let found:string|null=null;
 const outcome=await executeOneAttempt(authority,expectedBinding,binding=>port.create(binding,plan.payload),async binding=>{
  const raw=await port.readCreated(binding,plan.payload),snapshots=exactArray(raw);if(!snapshots)return {state:"unconfirmed",reasonCode:"malformed_readback"};if(snapshots.length===0)return {state:"unchanged",reasonCode:"verified_absence"};if(snapshots.length!==1)return {state:"unconfirmed",reasonCode:"multiple_matches"};found=snapshotMatches(snapshots[0] as IssueSnapshot,plan);return found?{state:"intended",reasonCode:"exact_intended"}:{state:"drift",reasonCode:"snapshot_mismatch"};
 });
 if(outcome.classification==="confirmed"&&found){const result=Object.freeze({...outcome,classification:"confirmed" as const,issueUrl:found});confirmedPublications.set(result,{plan,issueUrl:found});return result;}
 return Object.freeze({classification:outcome.classification==="no_write"?"no_write" as const:"unknown" as const,operationReason:outcome.operationReason,readBackReason:outcome.readBackReason});
}

export function prepareIssueLabelMutation(confirmed:IssuePublicationResult,currentSnapshot:IssueSnapshot,input:IssueLabelMutationInput):IssueLabelMutationPlan{
 const provenance=confirmed&&typeof confirmed==="object"?confirmedPublications.get(confirmed):undefined;if(!provenance)throw new Error("Label mutation requires genuine confirmed publication result");
 const exact=exactSnapshot(currentSnapshot,provenance.plan.binding),hash=exact?snapshotHash(exact,provenance.plan.binding):null,url=exact?snapshotMatches(exact,{...provenance.plan,labels:exact.labels}):null;if(!exact||!hash||url!==provenance.issueUrl)throw new Error("Current snapshot issue identity does not match confirmed publication");
 const labels=planProtectedLabelMutation({currentLabels:exact.labels,add:input.add,remove:input.remove,protectedLabels:input.protectedLabels,actorPermission:input.actorPermission,...(input.rationale===undefined?{}:{rationale:input.rationale})});
 const plan=Object.freeze({binding:provenance.plan.binding,issueUrl:url,candidateIdentity:provenance.plan.candidateIdentity,title:provenance.plan.title,body:provenance.plan.body,baselineSnapshotHash:hash,add:labels.add,remove:labels.remove,expectedFinalLabels:labels.expectedFinalLabels});mutationPlans.add(plan);return plan;
}

export async function executeIssueLabelMutation(plan:IssueLabelMutationPlan,readAuthority:RepositoryOperationAuthority,mutationAuthority:RepositoryOperationAuthority,bindings:Readonly<{read:RepositoryOperationBinding;mutation:RepositoryOperationBinding}>,port:IssuePublicationPort):Promise<IssueLabelMutationResult>{
 consumePlan(plan,mutationPlans,consumedMutationPlans,"Label mutation");if(!sameRepository(plan.binding,bindings.read)||bindings.read.action!=="remote_read"||!sameRepository(plan.binding,bindings.mutation)||bindings.mutation.action!=="label_mutate")throw new Error("Label mutation binding mismatch");
 const baseline=await executeAuthorizedRead(readAuthority,bindings.read,binding=>port.readIssue(binding,plan.issueUrl)),exactBaseline=exactSnapshot(baseline,plan.binding);
 if(!exactBaseline||snapshotHash(exactBaseline,plan.binding)!==plan.baselineSnapshotHash)return Object.freeze({classification:"unknown",operationReason:"not_attempted",readBackReason:"baseline_mismatch"});
 const mutation=Object.freeze({issueUrl:plan.issueUrl,baselineSnapshotHash:plan.baselineSnapshotHash,add:plan.add,remove:plan.remove});
 return executeOneAttempt(mutationAuthority,bindings.mutation,binding=>port.mutateLabels(binding,mutation),async binding=>{const observed=exactSnapshot(await port.readIssue(binding,plan.issueUrl),plan.binding);if(!observed)return {state:"unconfirmed",reasonCode:"missing_readback"};if(snapshotHash(observed,plan.binding)===plan.baselineSnapshotHash)return {state:"unchanged",reasonCode:"exact_unchanged"};const same=observed.url===plan.issueUrl&&observed.title===plan.title&&observed.body===plan.body&&observed.candidateIdentity===plan.candidateIdentity&&sameLabels(observed.labels,plan.expectedFinalLabels);return same?{state:"intended",reasonCode:"exact_intended"}:{state:"drift",reasonCode:"state_drift"};});
}
