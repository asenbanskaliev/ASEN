import {spawn,spawnSync,type ChildProcess,type ChildProcessWithoutNullStreams} from "node:child_process";import {isAbsolute,join,resolve as resolvePath} from "node:path";
import {mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {snapshotAgentModelFallback,type AgentFallbackListener,type AgentFallbackObservation,type AgentRequest,type AgentResult,type AgentRunner} from "./dispatcher.js";
import {matchesIssuedSkillContext} from "../skills/context.js";
import {checkPiVersion} from "../runtime/launcher.js";import {selectSkills} from "../skills/registry.js";
import {authorizePiWriteGrant} from "../lifecycle/skill-lifecycle.js";
import {consumeRunnerWriteReceiver} from "./dispatcher.js";
import {spawnContained} from "../evidence/spawn-contained.js";
import {authorityAssets} from "./pi-authority-assets.js";
import {isThinking} from "../runtime/profiles.js";
import {classifyAssistantError,getProcessModelFallbackCooldown,pickFallbackModel,shouldFallback,type TerminalErrorCategory} from "../runtime/model-fallback-policy.js";

export interface PiProcessOptions{
 command?:string;
 rpcArgs?:string[];
 extraArgs?:string[];
 timeoutMs?:number;
 maxOutputBytes?:number;
 maxStreamBytes?:number;
 maxRpcRecordBytes?:number;
 signal?:AbortSignal;
 providerExtension?:string;
 noTools?:boolean;
 attributionFile?:string;
 /**
  * Binds a worker turn to one exact file result.  The authority extension
  * consumes the path before the first write tool can run, so a model retry
  * cannot create a second side effect in that turn.  A barrier is optional
  * operational evidence: it is written after the exact bytes and attribution
  * are durable, before Pi is allowed to process the tool result.
  */
 exactWriteReceipt?:Readonly<{path:string;fileSha256:string;barrierFile?:string}>;
 policyRoot?:string;
 validateRuntimeVersion?:boolean;
 minimumRuntimeVersion?:string;
 providerCredential?:PiProviderCredential;
 onProcessStart?:(pid:number)=>void;
 onProcessClose?:(details:{code:number|null;signal:NodeJS.Signals|null;stderr:string})=>void;
 onToolExecution?:(event:Readonly<{type:"tool_execution_start"|"tool_execution_end";pid:number;toolName?:string;toolCallId?:string;isError?:boolean}>)=>void;
 /** Optional bounded native streaming witness. Never supplies model text or
  * authority; cancellation from a listener uses the existing AbortSignal. */
 onAssistantTextDelta?:(event:Readonly<{pid:number;requestId:string;observedCharacters:number}>)=>void;
 /** Emitted only after this child accepts a configured model switch. */
 onModelFallback?:AgentFallbackListener;
}
export interface PiChildSelectionObservation{
 readonly taskId:string;readonly sessionId:string;readonly projectId:string;
 readonly source:"child-reported";readonly model:Readonly<{provider:string;id:string}>|null;
 readonly thinking?:AgentRequest["thinking"];
}
type ChildSelectionListener=(observation:PiChildSelectionObservation)=>void;
type ChildSelectionSubscription=Readonly<{listener:ChildSelectionListener}>;
type ChildSelectionOwner=Readonly<Pick<PiChildSelectionObservation,"taskId"|"sessionId"|"projectId">>;
function selectionText(value:unknown,limit=256):value is string{return typeof value==="string"&&value.length>0&&value.length<=limit&&value===value.trim()&&!/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value);}
function childSelection(owner:ChildSelectionOwner,data:unknown):PiChildSelectionObservation|undefined{
 if(!data||typeof data!=="object"||Array.isArray(data))return;
 const value=data as {model?:unknown;thinkingLevel?:unknown};let model:PiChildSelectionObservation["model"]=null;
 if(value.model!==null){
  if(!value.model||typeof value.model!=="object"||Array.isArray(value.model))return;
  const chosen=value.model as {provider?:unknown;id?:unknown};if(!selectionText(chosen.provider)||!selectionText(chosen.id))return;
  model=Object.freeze({provider:chosen.provider,id:chosen.id});
 }
 const thinking=value.thinkingLevel;
 if(thinking!==undefined&&!isThinking(thinking))return;
 return Object.freeze({...owner,source:"child-reported",model,...(thinking!==undefined?{thinking}:{})});
}
export type PiProviderCredential="OPENROUTER_API_KEY"|"LLM7_API_KEY"|"GROQ_API_KEY"|"NVIDIA_API_KEY"|"OLLAMA_API_KEY";
const providerCredentialNames=new Set<PiProviderCredential>(["OPENROUTER_API_KEY","LLM7_API_KEY","GROQ_API_KEY","NVIDIA_API_KEY","OLLAMA_API_KEY"]);
const trustedProviderExtensions=new Set(["npm:pi-free@2.8.4","npm:pi-ollama-cloud@0.13.1"]);
export function configuredPiProviderCredential(environment:NodeJS.ProcessEnv):PiProviderCredential|undefined{
 const selected=environment.ASEN_AGENT_PROVIDER_CREDENTIAL;
 if(selected===undefined||selected==="")return undefined;
 if(typeof selected!=="string"||!providerCredentialNames.has(selected as PiProviderCredential))throw new Error("ASEN_AGENT_PROVIDER_CREDENTIAL must name one supported provider credential");
 return selected as PiProviderCredential;
}
const runtimeEnvironmentNames=["PATH","HOME","USERPROFILE","TMPDIR","TMP","TEMP","SYSTEMROOT","WINDIR","COMSPEC","PATHEXT","LANG","LC_ALL","LC_CTYPE","TZ","PI_CODING_AGENT_DIR","PI_PACKAGE_DIR","PI_OFFLINE","PI_SKIP_VERSION_CHECK"] as const;
/** Preserve Pi's runtime configuration while keeping unrelated ambient credentials out of child tasks. */
export function piRuntimeEnvironment(source:NodeJS.ProcessEnv,providerCredential?:PiProviderCredential,platform:NodeJS.Platform=process.platform):NodeJS.ProcessEnv{
 if(providerCredential!==undefined&&!providerCredentialNames.has(providerCredential))throw new Error("Unsupported Pi provider credential selection");
 const values=platform==="win32"?Object.fromEntries(Object.entries(source).map(([name,value])=>[name.toUpperCase(),value])):source,environment:NodeJS.ProcessEnv={};
 for(const name of runtimeEnvironmentNames){const value=values[name];if(typeof value==="string")environment[name]=value;}
 if(providerCredential){const value=values[providerCredential];if(typeof value==="string"&&value.length)environment[providerCredential]=value;}
 environment.PI_TELEMETRY="0";
 return environment;
}

export function piRuntimeRouteArgs(request:Pick<AgentRequest,"model"|"thinking">):string[]{
 const args:string[]=[];
 if(request.model!==undefined){if(typeof request.model!=="string"||!request.model.trim()||request.model!==request.model.trim()||request.model.length>256||/[\u0000-\u001f\u007f]/u.test(request.model))throw new Error("Invalid routed Pi model");args.push("--model",request.model);}
 if(request.thinking!==undefined){if(!isThinking(request.thinking))throw new Error("Invalid routed Pi thinking level");args.push("--thinking",request.thinking);}
 return args;
}

// This digest pins the reviewed policy source. Update it only after auditing extensions/authority.ts.
const authorityDigest="35731adec8525b6043dec7e06d8c35406388bd5d61f6fc2b9ace5c6528b199dd";


function exactWriteReceipt(value:PiProcessOptions["exactWriteReceipt"],request:AgentRequest):{path:string;fileSha256:string;barrierFile?:string}|undefined{
 if(value===undefined)return undefined;
 if(request.role!=="worker"||!request.writeSurfaces?.length)throw new Error("Exact write receipt requires a worker with write authority");
 const {path,fileSha256,barrierFile}=value;
 if(typeof path!=="string"||!path||path!==path.trim()||isAbsolute(path)||path.includes("\\")||path.split("/").some(part=>!part||part==="."||part==="..")||!request.writeSurfaces.includes(path))throw new Error("Exact write receipt path must be one declared write surface");
 if(typeof fileSha256!=="string"||!/^[0-9a-f]{64}$/u.test(fileSha256))throw new Error("Exact write receipt hash is invalid");
 if(barrierFile!==undefined&&(typeof barrierFile!=="string"||!isAbsolute(barrierFile)))throw new Error("Exact write receipt barrier must be an absolute path");
 return Object.freeze({path,fileSha256,...(barrierFile===undefined?{}:{barrierFile})});
}

async function terminateTree(child:ChildProcess,closed:Promise<void>):Promise<void>{
 if(!child.pid){await closed;return;}
 if(process.platform==="win32"){
  await new Promise<void>(resolve=>{
   const killer=spawn("taskkill",["/pid",String(child.pid),"/T","/F"],{stdio:"ignore",windowsHide:true});
   killer.once("error",()=>{child.kill("SIGKILL");resolve();});
   killer.once("close",code=>{if(code!==0)child.kill("SIGKILL");resolve();});
  });
 }else{
  try{process.kill(-child.pid,"SIGKILL");}catch{child.kill("SIGKILL");}
 }
 await closed;
}

function promptWithSkills(request:AgentRequest):string{
 const paths=request.skillPaths??[];
 if(paths.length||request.skillContext){
  if(!request.skillContext||!matchesIssuedSkillContext(request.skillContext,request.id,request.repository,request.candidate)) throw new Error("Pi skill paths require matching ASEN-issued context and candidate");
  const selected=selectSkills(request.skillContext).map(skill=>skill.path);
  if(selected.length!==paths.length||selected.some((path,index)=>path!==paths[index])) throw new Error("Pi skill paths do not match issued context");
 }
 if(!paths.length)return request.prompt;
 if(paths.some(path=>!/^skills\/asen-[a-z-]+\/SKILL\.md$/.test(path))){
  throw new Error("Invalid Pi-native skill path");
 }
 return [
  "ASEN issued these exact Pi-native skill contracts for this task.",
  "Load every SKILL.md below before task-specific work. Treat their runtime rules as authoritative; do not replace them with summaries.",
  ...paths.map(path=>"- "+path),
  "",
  "Task:",
  request.prompt
 ].join("\n");
}

export class PiProcessRunner implements AgentRunner{
 readonly #selectionSubscriptions=new Set<ChildSelectionSubscription>();
 readonly #fallbackSubscriptions=new Set<Readonly<{listener:AgentFallbackListener}>>();
 #runtimeVerified=false;
 constructor(private readonly options:PiProcessOptions={}){}
 subscribeModelFallback(listener:AgentFallbackListener):()=>void{if(typeof listener!=="function")throw new TypeError("Model fallback observer must be a function");const subscription=Object.freeze({listener});this.#fallbackSubscriptions.add(subscription);return()=>{this.#fallbackSubscriptions.delete(subscription);};}
 /** Optional, nonpersistent selection reports; subscription replacement never revives old launches. */
 subscribeChildSelection(listener:ChildSelectionListener):()=>void{
  if(typeof listener!=="function")throw new TypeError("Child selection observer must be a function");
  const subscription=Object.freeze({listener});this.#selectionSubscriptions.add(subscription);
  return ()=>{this.#selectionSubscriptions.delete(subscription);};
 }

 run(request:AgentRequest,runSignal?:AbortSignal):Promise<AgentResult>{
  const selectionSubscriptions=[...this.#selectionSubscriptions],fallbackSubscriptions=[...this.#fallbackSubscriptions];let selectionOwner:ChildSelectionOwner|undefined,fallbackOwner:Readonly<Pick<AgentFallbackObservation,"taskId"|"sessionId"|"projectId">>|undefined;
  if(selectionSubscriptions.length){
   try{const taskId=request.id,sessionId=request.isolationKey??"default",projectId=realpathSync(request.repository);if(selectionText(taskId,1024)&&selectionText(sessionId,1024)&&selectionText(projectId,32768))selectionOwner=Object.freeze({taskId,sessionId,projectId});}
   catch{/* Observation identity is optional; existing execution guards still decide launch. */}
  }
  if(this.options.onModelFallback||fallbackSubscriptions.length){const taskId=request.id,sessionId=request.isolationKey??"default",projectId=request.repository;if(selectionText(taskId,1024)&&selectionText(sessionId,1024)&&selectionText(projectId,32768))fallbackOwner=Object.freeze({taskId,sessionId,projectId});}
  const receiverValid=request.runnerWriteReceiver!==undefined&&consumeRunnerWriteReceiver(request.runnerWriteReceiver,request);
  if(request.runnerWriteReceiver!==undefined&&!receiverValid)return Promise.resolve({id:request.id,ok:false,output:"Pi write tools require an exact dispatcher receiver"});
  if(request.candidate&&(!request.skillContext||!request.skillPaths))return Promise.resolve({id:request.id,ok:false,output:"Candidate-bound Pi execution requires issued skill context and exact paths"});
  if(request.skillContext){
   const rolePhase=request.role==="explorer"?"explore":request.role==="reviewer"?"adversarial-review":request.role==="verifier"?"verify":undefined;
   if(request.expectedPhase&&rolePhase&&request.expectedPhase!==rolePhase)return Promise.resolve({id:request.id,ok:false,output:"Pi expected phase does not match agent role"});
   const requiredPhase=rolePhase??request.expectedPhase;
   if(requiredPhase&&request.skillContext.phase!==requiredPhase)return Promise.resolve({id:request.id,ok:false,output:"Pi skill context phase does not match agent role"});
  }
  if(request.writeSurfaces?.length&&request.skillContext?.phase!=="apply")return Promise.resolve({id:request.id,ok:false,output:"Pi write authority requires issued apply phase"});
  const command=this.options.command??"pi";
  if (this.options.validateRuntimeVersion && !this.#runtimeVerified) {
   const minimumRuntimeVersion = this.options.minimumRuntimeVersion ?? "1.2.0";
   const versionArguments = [...(this.options.rpcArgs ?? ["--mode","rpc"]), "--version"];
   let versionEnvironment: NodeJS.ProcessEnv;
   try { versionEnvironment = piRuntimeEnvironment(process.env, this.options.providerCredential); }
   catch (error) { return Promise.resolve({ id: request.id, ok: false, output: (error instanceof Error ? error.message : "Invalid Pi runtime environment") }); }
   const versionResult = spawnSync(command, versionArguments, { encoding: "utf8", timeout: 5000, env: versionEnvironment, windowsHide: true, maxBuffer: 64 * 1024 });
   if (versionResult.error || (versionResult.status !== 0 && versionResult.signal === null))
    return Promise.resolve({ id: request.id, ok: false, output: "Pi runtime version check failed: " + String(versionResult.error ?? versionResult.stderr ?? "nonzero exit") });
   const observed = String(versionResult.stdout ?? "") + String(versionResult.stderr ?? "");
   const validated = checkPiVersion(observed, minimumRuntimeVersion);
   if (!validated.ok)
    return Promise.resolve({ id: request.id, ok: false, output: "Pi runtime " + (validated.version ?? "unknown") + " is not compatible; minimum is " + minimumRuntimeVersion });
   this.#runtimeVerified = true;
  }
  let childEnvironment:NodeJS.ProcessEnv;try{childEnvironment=piRuntimeEnvironment(process.env,this.options.providerCredential);}catch(error){return Promise.resolve({id:request.id,ok:false,output:error instanceof Error?error.message:"Invalid Pi runtime environment"});}
  let message:string;
  try{message=promptWithSkills(request);}
  catch(error){return Promise.resolve({id:request.id,ok:false,output:`pi skill path error: ${String(error)}`});}
  const extra=this.options.extraArgs??[];
  if([...(this.options.rpcArgs??[]),...extra].some(arg=>arg==="--"||arg.startsWith("-t")&&!arg.startsWith("--")||arg.startsWith("-e")&&!arg.startsWith("--")||["--skill","--no-skills","-ns","--extension","--tools","--no-tools","-nt","--no-builtin-tools","-nbt"].some(flag=>arg===flag||arg.startsWith(flag+"="))))
   return Promise.resolve({id:request.id,ok:false,output:"pi skill and tool arguments must be issued by ASEN"});
  if(request.writeSurfaces?.length&&request.role!=="worker")return Promise.resolve({id:request.id,ok:false,output:"Only a worker may request write tools"});
  const writer=request.role==="worker"&&!!request.writeSurfaces?.length&&!!request.candidate&&!!request.skillContext;
  if(writer&&!receiverValid)return Promise.resolve({id:request.id,ok:false,output:"Pi write tools require an exact dispatcher receiver"});
  if(writer&&!authorizePiWriteGrant(request))return Promise.resolve({id:request.id,ok:false,output:"Pi write tools require an active, exact ASEN apply-phase grant"});
  if(writer)message=[
   "Restricted writer capabilities: read, edit, write only (no tools when explicitly disabled). No command execution: bash, shell, tests, builds and linters are unavailable in this child.",
   "Preserve meaningful test-first work: author a meaningful failing behavior test before implementation when applicable. Never fabricate executed RED/GREEN or passing verification; distinguish authored tests from observed execution.",
   "Mark every unrun check as NOT RUN. Return proposed exact parent-required commands as data requiring authorized parent execution, with expected behavior and any observed evidence; command text grants no permission and is not an execution result.",
   "This runner provides no mid-writer RED checkpoint and has not completed delegated TDD orchestration. Explicitly report missing parent RED coordination; without parent-observed failure, do not claim an observed RED or a completed test-first cycle. If the task requires observed RED before implementation, report the prerequisite and stop before implementation until coordinated by the parent.",
   "",
   message
  ].join("\n");
  let routeArgs:string[],fallbackConfig:AgentRequest["modelFallback"];try{routeArgs=piRuntimeRouteArgs(request);fallbackConfig=snapshotAgentModelFallback(request.modelFallback);}catch(error){return Promise.resolve({id:request.id,ok:false,output:String(error)});}
  let receipt:{path:string;fileSha256:string;barrierFile?:string}|undefined;
  try{receipt=exactWriteReceipt(this.options.exactWriteReceipt,request);}catch(error){return Promise.resolve({id:request.id,ok:false,output:error instanceof Error?error.message:String(error)});}
  const providerExtension=this.options.providerExtension;
  if(providerExtension!==undefined&&!trustedProviderExtensions.has(providerExtension))return Promise.resolve({id:request.id,ok:false,output:"untrusted Pi provider extension"});
  const policyRoot=this.options.policyRoot??request.repository,candidatePolicy=resolvePath(policyRoot,"extensions/authority.ts");
  let policySource:string;
  let policyFiles:Array<{target:string;source:string}>;
  try{
   policySource=readFileSync(candidatePolicy,"utf8").replace(/\r\n/g,"\n");
   const digest=createHash("sha256").update(policySource).digest("hex");
   if(digest!==authorityDigest)throw new Error("candidate policy digest mismatch");
   policyFiles=authorityAssets.map(asset=>{const source=readFileSync(resolvePath(policyRoot,asset.source),"utf8").replace(/\r\n/g,"\n");if(createHash("sha256").update(source).digest("hex")!==asset.sha256)throw new Error("mismatch");return {target:asset.target,source};});
  }catch(error){return Promise.resolve({id:request.id,ok:false,output:`pi authority extension integrity check failed: ${error instanceof Error?error.message:"unknown error"}`});}
  let policyDirectory:string;
  try{
   policyDirectory=mkdtempSync(join(tmpdir(),"asen-policy-"));
   const extensionPath=join(policyDirectory,"extensions","authority.ts");mkdirSync(join(policyDirectory,"extensions"),{recursive:true,mode:0o700});
   writeFileSync(extensionPath,policySource,{mode:0o400,flag:"wx"});
   for(const asset of policyFiles){const target=join(policyDirectory,asset.target);mkdirSync(target.slice(0,target.lastIndexOf("/")),{recursive:true,mode:0o700});writeFileSync(target,asset.source,{mode:0o400,flag:"wx"});}
  }catch(error){
   if(policyDirectory!)rmSync(policyDirectory,{recursive:true,force:true});
   return Promise.resolve({id:request.id,ok:false,output:`pi authority extension preparation failed: ${String(error)}`});
  }
  const policy=join(policyDirectory,"extensions","authority.ts");
  const args=[...(this.options.rpcArgs??["--mode","rpc"]),...extra,...routeArgs,
   "--no-extensions","--extension",policy,...(providerExtension?["--extension",providerExtension]:[]),"--no-skills",...(this.options.noTools?["--no-tools"]:["--tools",writer?"read,edit,write":"read"]),...(request.skillPaths??[]).flatMap(path=>["--skill",path])];
  const timeoutMs=this.options.timeoutMs??120_000;
  const max=this.options.maxOutputBytes??1_000_000;
  const maxStream=this.options.maxStreamBytes??32_000_000;
  const maxRecord=Math.min(this.options.maxRpcRecordBytes??2_000_000,max);
  const signal=runSignal&&this.options.signal?AbortSignal.any([runSignal,this.options.signal]):runSignal??this.options.signal;

  return new Promise(resolve=>{
   const child=spawnContained(command,args,{
    cwd:request.repository,
    env:{...childEnvironment,ASEN_PI_AUTHORITY:JSON.stringify({repository:request.repository,role:request.role,writeSurfaces:writer?request.writeSurfaces:[],agentId:request.id,sessionId:request.isolationKey??"default",...(this.options.attributionFile?{attributionFile:this.options.attributionFile}:{}),...(receipt?{exactWriteReceipt:receipt}:{})})},
    stdio:["pipe","pipe","pipe"],
    detached:process.platform!=="win32"
   }) as ChildProcessWithoutNullStreams;
   if(child.pid!==undefined){try{this.options.onProcessStart?.(child.pid);}catch{/* Evidence observers cannot alter Pi execution. */}}
   let stdout="",stderr="",settled=false,overflow=false,buffer="",policyLoaded=false,toolAttempted=false,agentEnded=false,streamBytes=0,retainedBytes=0,stopResult:AgentResult|undefined;
   const fallbackChain=fallbackConfig?.chain??[],fallbackEnabled=fallbackChain.length>0,triedModels=new Set<string>(),cooldown=getProcessModelFallbackCooldown();
   let assistantStreamActive=false,lastAssistantFailure:TerminalErrorCategory|undefined,finalFailure:TerminalErrorCategory|undefined,fallbackInProgress=false,finalAgentSettled=!fallbackEnabled,rpcSequence=0,currentModel=request.model;
   const pendingRpc=new Map<string,{resolve:(response:Record<string,unknown>)=>void}>();
   const preflightId=`asen-policy:${request.id}`,selectionId=`asen-selection:${request.id}`;
   let selectionRequested=false,selectionResponded=false;
   const closed=new Promise<void>(resolveClosed=>{child.once("close",()=>resolveClosed());child.once("error",()=>{if(child.pid===undefined)resolveClosed();});});
   let timer:ReturnType<typeof setTimeout>|undefined;

   const finish=(result:AgentResult)=>{
    if(settled)return;
    settled=true;
    clearTimeout(timer);
    signal?.removeEventListener("abort",onAbort);
    for(const pending of pendingRpc.values())pending.resolve({success:false,error:"task finished"});pendingRpc.clear();
    rmSync(policyDirectory,{recursive:true,force:true});
    resolve(result);
   };
   const stop=(result:AgentResult)=>{
    if(stopResult)return;
    stopResult=result;
    void terminateTree(child,closed).then(()=>finish(result));
   };
   const alive=()=>!settled&&!stopResult&&!signal?.aborted;
   const sendRpc=(payload:Record<string,unknown>):Promise<Record<string,unknown>>=>{
    if(!alive())return Promise.resolve({success:false,error:"task is not running"});
    const id=`asen-fallback:${request.id}:${++rpcSequence}`;
    return new Promise(resolveRpc=>{pendingRpc.set(id,{resolve:resolveRpc});try{child.stdin.write(JSON.stringify({id,...payload})+"\n");}catch{pendingRpc.delete(id);resolveRpc({success:false,error:"RPC transport unavailable"});}});
   };
   const publishFallback=(change:Omit<AgentFallbackObservation,"taskId"|"sessionId"|"projectId">)=>{
    if(!fallbackOwner)return;const observation=Object.freeze({...fallbackOwner,...change});
    try{this.options.onModelFallback?.(observation);}catch{/* Observers cannot affect child execution. */}
    for(const subscription of fallbackSubscriptions){if(!this.#fallbackSubscriptions.has(subscription))continue;try{subscription.listener(observation);}catch{/* Observers cannot affect child execution. */}}
   };
   const closeSettled=(category?:TerminalErrorCategory)=>{if(!alive())return;finalFailure=category;try{child.stdin.end();}catch{stop({id:request.id,ok:false,output:"pi stdin error during settlement"});}};
   const continueFallback=(category:TerminalErrorCategory)=>{
    if(fallbackInProgress||!alive())return;fallbackInProgress=true;agentEnded=false;
    if(currentModel){triedModels.add(currentModel);cooldown.mark(currentModel,category);}else triedModels.add("<provider-default>");
    const next=()=>{
     for(;;){const pick=pickFallbackModel(currentModel,fallbackChain,{cooldown,tried:triedModels});if(!pick?.fallback||!pick.model)return undefined;triedModels.add(pick.model);const slash=pick.model.indexOf("/");if(slash>0&&slash<pick.model.length-1)return{pick,provider:pick.model.slice(0,slash),modelId:pick.model.slice(slash+1)};}
    };
    void(async()=>{
     for(;;){
      const candidate=next();if(!candidate){fallbackInProgress=false;closeSettled(category);return;}
      const switched=await sendRpc({type:"set_model",provider:candidate.provider,modelId:candidate.modelId});if(!alive())return;
      if(switched.success!==true)continue;
      const from=currentModel,to=candidate.pick.model!,thinking=candidate.pick.thinking??request.thinking;currentModel=to;let appliedThinking:typeof thinking;
      if(thinking){const effort=await sendRpc({type:"set_thinking_level",level:thinking});if(!alive())return;if(effort.success===true)appliedThinking=thinking;}
      const observation=Object.freeze({...(from===undefined?{}:{from}),to,category,...(appliedThinking===undefined?{}:{thinking:appliedThinking})});publishFallback(observation);
      const resumed=await sendRpc({type:"prompt",message:"Continue the same task using the existing conversation context."});if(!alive())return;
      if(resumed.success!==true){fallbackInProgress=false;closeSettled(category);return;}
      lastAssistantFailure=undefined;finalFailure=undefined;finalAgentSettled=false;fallbackInProgress=false;return;
     }
    })().catch(()=>{fallbackInProgress=false;closeSettled(category);});
   };
   const onAbort=()=>{triedModels.clear();stop({id:request.id,ok:false,output:"pi process cancelled"});};
   child.stdout.on("data",data=>{
    streamBytes+=Buffer.byteLength(data);
    if(streamBytes>maxStream){overflow=true;stop({id:request.id,ok:false,output:`pi stream exceeded ${maxStream} bytes`});return;}
    buffer+=String(data);
    let end;while((end=buffer.indexOf("\n"))>=0){
     const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
     let record:unknown;try{record=JSON.parse(line);}catch{record=line;}
     const response=(record&&typeof record==="object"?record:{}) as {type?:string;id?:string;command?:string;success?:boolean;toolName?:unknown;toolCallId?:unknown;isError?:unknown;data?:{commands?:Array<{name:string;source:string;sourceInfo?:{path:string}}>;} };
     const type=response.type;
     if(type==="response"&&typeof response.id==="string"){
      const pending=pendingRpc.get(response.id);if(pending){pendingRpc.delete(response.id);pending.resolve(record as Record<string,unknown>);continue;}
     }
     if(type==="message_end"&&(record as {message?:{role?:unknown}}).message?.role==="assistant")lastAssistantFailure=classifyAssistantError((record as {message?:Parameters<typeof classifyAssistantError>[0]}).message);
     // Pi 1.2 RPC wire strips cumulative message from message_update; bind
     // text deltas to a preceding native message_start(role=assistant), never
     // to a model-controlled property or an untracked stream fragment.
     if(type==="message_start"&&policyLoaded)
      assistantStreamActive=(record as {message?:{role?:unknown}}).message?.role==="assistant";
     if(type==="message_end"||type==="agent_end")assistantStreamActive=false;
     // A native Pi assistant text delta proves the provider returned actual
     // partial output. Read-only diagnostics receive counts, never model text.
     if(type==="message_update"&&policyLoaded&&!agentEnded&&!settled&&!stopResult&&
        !signal?.aborted&&child.pid!==undefined&&this.options.onAssistantTextDelta){
      const update=record as {message?:{role?:unknown};assistantMessageEvent?:{type?:unknown;delta?:unknown}};
      const delta=update.assistantMessageEvent;
      if(assistantStreamActive&&
         (update.message===undefined||update.message?.role==="assistant")&&
         delta?.type==="text_delta"&&
         typeof delta.delta==="string"&&delta.delta.length>0){
       const observation=Object.freeze({pid:child.pid,requestId:request.id,
        observedCharacters:Math.min(delta.delta.length,4096)});
       try{this.options.onAssistantTextDelta(observation);}catch{/* Observers cannot affect processing. */}
      }
     }
     if((type==="tool_execution_start"||type==="tool_execution_end")&&child.pid!==undefined){
      const event=Object.freeze({type,pid:child.pid,
       ...(typeof response.toolName==="string"?{toolName:response.toolName}:{}),
       ...(typeof response.toolCallId==="string"?{toolCallId:response.toolCallId}:{}),
       ...(typeof response.isError==="boolean"?{isError:response.isError}:{}),
      });
      try{this.options.onToolExecution?.(event);}catch{/* Evidence observers cannot alter Pi execution. */}
     }
     if(selectionOwner&&selectionSubscriptions.length&&type==="response"&&(response.id===selectionId||response.command==="get_state")){
      if(selectionRequested&&!selectionResponded&&response.id===selectionId&&policyLoaded&&!settled&&!stopResult&&!agentEnded&&!signal?.aborted){
       selectionResponded=true;
       const observation=response.success===true&&response.command==="get_state"?childSelection(selectionOwner,response.data):undefined;
       if(observation)for(const subscription of selectionSubscriptions){
        if(!this.#selectionSubscriptions.has(subscription))continue;
        try{void Promise.resolve(subscription.listener(observation)).catch(()=>{});}catch{/* Descriptive observers cannot alter execution. */}
       }
      }
      continue; // Raw state is never part of the retained execution output.
     }
     const keep=typeof record==="string"||agentEnded||type==="agent_end"||type==="message_end"&&((record as {message?:{role?:string}}).message?.role==="assistant")||type==="response"&&(response.id===preflightId||response.id===request.id)||typeof type==="string"&&type.startsWith("tool_execution_");
     if(keep){
      const retained=line+"\n";retainedBytes+=Buffer.byteLength(retained);
      if(retainedBytes>max){overflow=true;stop({id:request.id,ok:false,output:`pi retained output exceeded ${max} bytes`});return;}
      stdout+=retained;
     }
     if(type==="agent_end")agentEnded=true;
     if(response.type==="tool_execution_start"&&this.options.noTools){toolAttempted=true;stop({id:request.id,ok:false,output:"pi model attempted a tool while tools were disabled"});return;}
     if(response.type==="agent_end"&&policyLoaded&&!fallbackEnabled){child.stdin.end();continue;}
     if(response.type==="agent_settled"&&policyLoaded&&fallbackEnabled&&!fallbackInProgress){
      if(lastAssistantFailure&&shouldFallback(lastAssistantFailure)){finalAgentSettled=false;continueFallback(lastAssistantFailure);}
      else{finalAgentSettled=true;triedModels.clear();closeSettled(lastAssistantFailure);}
      continue;
     }
     if(response.type!=="response"||response.id!==preflightId)continue;
     const matches=response.data?.commands?.filter(item=>item.name==="asen-authority-status"&&item.source==="extension"&&item.sourceInfo?.path===policy)??[];
     if(response.success!==true||matches.length!==1){stop({id:request.id,ok:false,output:"pi ASEN policy extension was not loaded"});return;}
     const canonical=(path:string)=>{try{return realpathSync(path);}catch{return resolvePath(path);}};
     const expected=(request.skillPaths??[]).map(path=>canonical(resolvePath(request.repository,path)));
     const observed=response.data?.commands?.filter(item=>item.source==="skill").map(item=>typeof item.sourceInfo?.path==="string"?canonical(item.sourceInfo.path):"")??[];
     if(observed.length!==expected.length||observed.some((path,index)=>path!==expected[index])){stop({id:request.id,ok:false,output:"pi native Skill paths do not match ASEN selection"});return;}
     policyLoaded=true;
     if(selectionOwner&&selectionSubscriptions.length&&!selectionRequested){selectionRequested=true;child.stdin.write(JSON.stringify({id:selectionId,type:"get_state"})+"\n");}
     child.stdin.write(JSON.stringify({id:request.id,type:"prompt",message})+"\n");
    }
    if(Buffer.byteLength(buffer)>maxRecord){overflow=true;stop({id:request.id,ok:false,output:`pi RPC record exceeded ${maxRecord} bytes`});}
   });
   child.stderr.on("data",data=>{streamBytes+=Buffer.byteLength(data);if(streamBytes>maxStream){overflow=true;stop({id:request.id,ok:false,output:`pi stream exceeded ${maxStream} bytes`});return;}stderr=(stderr+String(data)).slice(-16_384);});
   child.on("error",error=>{if(!stopResult)finish({id:request.id,ok:false,output:`pi process error: ${String(error)}`});});
   child.on("close",code=>{
    try{this.options.onProcessClose?.({code,signal:child.signalCode,stderr});}catch{/* Evidence observers cannot alter Pi execution. */}
    if(stopResult)return;
    if(!policyLoaded)return finish({id:request.id,ok:false,output:"pi ASEN policy extension was not confirmed"});
    if(code===0&&!overflow){
     try{
      const records=stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
      const responses=records.filter(record=>record?.type==="response"&&record?.id===request.id);
      if(toolAttempted)return finish({id:request.id,ok:false,output:"pi model attempted a tool while tools were disabled"});
      if(!responses.length)return finish({id:request.id,ok:false,output:"pi correlated response missing"});
      if(responses.length!==1)return finish({id:request.id,ok:false,output:"pi requires exactly one correlated response"});
      const envelope=responses[0];
      if(envelope.success!==true)return finish({id:request.id,ok:false,output:"pi correlated response failed"});
      if(fallbackEnabled&&!finalAgentSettled)return finish({id:request.id,ok:false,output:"pi child exited before final agent_settled"});
      if(finalFailure)return finish({id:request.id,ok:false,output:`pi assistant failed: ${finalFailure}`});
     }catch{
      return finish({id:request.id,ok:false,output:"pi response envelope invalid"});
     }
    }
    finish({
     id:request.id,
     ok:code===0&&!overflow,
     output:overflow?`pi output exceeded ${max} bytes`:code===0?stdout:`pi process exited with code ${code??"unknown"}`
    });
   });

   timer=setTimeout(()=>{
    stop({id:request.id,ok:false,output:`pi process timed out after ${timeoutMs}ms`});
   },timeoutMs);

   if(signal?.aborted)onAbort();
   else signal?.addEventListener("abort",onAbort,{once:true});

   child.stdin.on("error",error=>stop({id:request.id,ok:false,output:`pi stdin error: ${String(error)}`}));
   child.stdin.write(JSON.stringify({id:preflightId,type:"get_commands"})+"\n");
  });
 }
}
