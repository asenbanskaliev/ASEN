import {execFile,execFileSync} from "node:child_process";
import {accessSync,constants,lstatSync,readFileSync,realpathSync,statSync} from "node:fs";
import {homedir,tmpdir} from "node:os";
import {delimiter,isAbsolute,join,relative,resolve} from "node:path";
import {promisify,types} from "node:util";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";

export interface CodeIntelligenceOptions {
  executable?:string;
  script?:string;
  timeoutMs?:number;
  maxOutputBytes?:number;
}
export interface CodeGraphToolParameters {operation:"init"|"query"|"explore";query?:string;limit?:number}
export interface CodeGraphCommandResult {stdout:string;stderr:string}
export interface CodeGraphRunOptions {cwd:string;signal?:AbortSignal;maxBuffer:number}
export type CodeGraphRunner=(args:readonly string[],options:CodeGraphRunOptions)=>Promise<CodeGraphCommandResult>;

type CompatibilityRequest={operation:"query"|"explore";query:string;limit:number};
type ExecutableCommand={executable:string;prefix:string[]};
type ToolAnnotations={readOnlyHint:boolean;destructiveHint:boolean;idempotentHint:boolean;openWorldHint:boolean};
type AnnotatedToolDefinition=ToolDefinition<any>&{
  annotations:ToolAnnotations;
  renderShell?:"self";
  promptSnippet?:string;
  promptGuidelines?:readonly string[];
};

const execute=promisify(execFile);
const DEFAULT_LIMIT=10;
const MAX_OUTPUT_CHARS=100_000;
const PROCESS_MAX_BUFFER=MAX_OUTPUT_CHARS*2;
const FALLBACK_INSTRUCTIONS="Use read, grep, and find for this exploration.";
const CODEGRAPH_TOOL_PARAMETERS={
  type:"object",
  additionalProperties:false,
  required:["operation"],
  properties:{
    operation:{type:"string",enum:["init","query","explore"]},
    query:{type:"string",minLength:1,maxLength:2000},
    limit:{type:"integer",minimum:1,maximum:20},
  },
} as const;

function contained(root:string,file:string):boolean {
  const suffix=relative(root,file);
  return suffix!==".."&&!/^\.\.[/\\]/.test(suffix)&&!isAbsolute(suffix);
}
function regular(file:string):string {
  const canonical=realpathSync.native(file);
  if(!statSync(canonical).isFile())throw new Error("Invalid executable");
  return canonical;
}

/** Resolve npm Windows shims to their real JS entry; never execute cmd/PowerShell. */
export function resolveCodeGraphEntry(packageRoot:string):string {
  const root=realpathSync.native(packageRoot);
  const metadata=regular(join(root,"package.json"));
  if(!contained(root,metadata))throw new Error("Escaping package metadata");
  if(statSync(metadata).size>32768)throw new Error("Oversized package metadata");
  let pkg:unknown;
  try{pkg=JSON.parse(readFileSync(metadata,"utf8"));}
  catch{throw new Error("Invalid package metadata");}
  const bin=typeof pkg==="object"&&pkg!==null&&"bin" in pkg?(pkg as {bin?:unknown}).bin:undefined;
  const target=typeof bin==="string"?bin:typeof bin==="object"&&bin!==null&&"codegraph" in bin?(bin as {codegraph?:unknown}).codegraph:undefined;
  if(typeof target!=="string"||!target||isAbsolute(target)||/^[A-Za-z]:/.test(target)||target.split(/[/\\]/).some(part=>part===".."))throw new Error("Invalid package entry");
  const script=regular(resolve(root,target));
  if(!contained(root,script)||!/\.[cm]?js$/.test(script))throw new Error("Escaping package entry");
  return script;
}

export function normalizePathEntry(entry:string):string {
  return entry.length>=2&&entry.startsWith('"')&&entry.endsWith('"')?entry.slice(1,-1):entry;
}

function command(options:CodeIntelligenceOptions):ExecutableCommand {
  if(options.script){
    if(!isAbsolute(options.script))throw new Error("Script must be absolute");
    return {executable:regular(process.execPath),prefix:[regular(options.script)]};
  }
  if(options.executable){
    if(!isAbsolute(options.executable)||/\.(?:cmd|bat|ps1)$/i.test(options.executable))throw new Error("Executable must be absolute and shell-free");
    return {executable:regular(options.executable),prefix:[]};
  }
  for(const entry of (process.env.Path??process.env.PATH??"").split(delimiter)){
    const directory=normalizePathEntry(entry);
    if(!directory||!isAbsolute(directory))continue;
    try{
      if(process.platform==="win32"){
        try{return {executable:regular(join(directory,"codegraph.exe")),prefix:[]};}catch{/* Fall through to the contained npm entry. */}
        return {executable:regular(process.execPath),prefix:[resolveCodeGraphEntry(join(directory,"node_modules","@colbymchenry","codegraph"))]};
      }
      const executable=regular(join(directory,"codegraph"));
      accessSync(executable,constants.X_OK);
      return {executable,prefix:[]};
    }catch{/* Continue through PATH candidates. */}
  }
  throw Object.assign(new Error("Unavailable"),{code:"ENOENT"});
}

function constrainedEnvironment():NodeJS.ProcessEnv {
  const env:NodeJS.ProcessEnv={};
  for(const key of ["PATH","Path","HOME","USERPROFILE","SystemRoot","TEMP","TMP","LANG","LC_ALL"]){
    if(process.env[key])env[key]=process.env[key];
  }
  return env;
}

function boundedConfiguration(options:CodeIntelligenceOptions):{timeout:number;maxBuffer:number} {
  const timeout=options.timeoutMs??15000;
  const maxBuffer=options.maxOutputBytes??100000;
  if(!Number.isSafeInteger(timeout)||timeout<1||timeout>30000||!Number.isSafeInteger(maxBuffer)||maxBuffer<1||maxBuffer>200000)throw new Error("Invalid CodeGraph execution limits");
  return {timeout,maxBuffer};
}

async function runHardened(args:readonly string[],runOptions:CodeGraphRunOptions,configuration:CodeIntelligenceOptions):Promise<CodeGraphCommandResult> {
  const {timeout}=boundedConfiguration(configuration);
  const {executable,prefix}=command(configuration);
  const observed=await execute(executable,[...prefix,...args],{
    cwd:runOptions.cwd,
    env:constrainedEnvironment(),
    signal:runOptions.signal,
    timeout,
    maxBuffer:runOptions.maxBuffer,
    killSignal:"SIGKILL",
    windowsHide:true,
    shell:false,
    encoding:"utf8",
  });
  return {stdout:String(observed.stdout??""),stderr:String(observed.stderr??"")};
}

function createCodeGraphRunner(options:CodeIntelligenceOptions={}):CodeGraphRunner {
  const configuration=Object.freeze({...options});
  return (args,runOptions)=>runHardened(args,runOptions,configuration);
}

function rootFor(cwd:string):string {
  const root=realpathSync.native(cwd);
  if(!statSync(root).isDirectory()||root===realpathSync.native(homedir())||root===realpathSync.native(tmpdir()))throw new Error("Invalid root");
  const env={...process.env};
  for(const key of Object.keys(env))if(key.startsWith("GIT_"))delete env[key];
  const observed=execFileSync("git",["-c","core.quotepath=false","-C",root,"rev-parse","--show-toplevel"],{
    env,encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:5000,maxBuffer:16384,windowsHide:true,
  }).trim();
  if(realpathSync.native(observed)!==root)throw new Error("Current directory must be the canonical Git root");
  return root;
}

function assertSafeIndexDirectory(cwd:string):void {
  try{
    const index=lstatSync(join(cwd,".codegraph"));
    if(index.isSymbolicLink()||!index.isDirectory())throw new Error("CodeGraph .codegraph must be a real directory when it already exists.");
  }catch(error){
    if(typeof error==="object"&&error!==null&&"code" in error&&(error as NodeJS.ErrnoException).code==="ENOENT")return;
    throw error;
  }
}

function plainRecord(value:unknown):value is Record<string,unknown> {
  return !!value&&typeof value==="object"&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype;
}
function compatibilityParameters(value:unknown):CompatibilityRequest|null {
  if(!plainRecord(value))return null;
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(value).some(key=>typeof key!=="string"||!["operation","query","limit"].includes(key)||!("value" in descriptors[key]!)))return null;
  const operation=descriptors.operation?.value;
  const query=descriptors.query?.value;
  const limit=descriptors.limit?descriptors.limit.value:DEFAULT_LIMIT;
  if((operation!=="query"&&operation!=="explore")||typeof query!=="string"||!query.trim()||query.length>2000||/[\u0000-\u001f\u007f]/.test(query)||!Number.isInteger(limit)||limit<1||limit>20)return null;
  return {operation,query,limit};
}
function canonicalParameters(value:unknown):CodeGraphToolParameters {
  if(!plainRecord(value))throw new Error("Invalid CodeGraph parameters");
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(value).some(key=>typeof key!=="string"||!["operation","query","limit"].includes(key)||!("value" in descriptors[key]!)))throw new Error("Invalid CodeGraph parameters");
  const operation=descriptors.operation?.value;
  const query=descriptors.query?.value;
  const limit=descriptors.limit?.value;
  if(operation!=="init"&&operation!=="query"&&operation!=="explore")throw new Error("Invalid CodeGraph operation");
  if(limit!==undefined&&(!Number.isInteger(limit)||limit<1||limit>20))throw new Error("CodeGraph limit must be an integer between 1 and 20.");
  if(operation!=="init"&&(typeof query!=="string"||!query.trim()||query.length>2000||/[\u0000-\u001f\u007f]/.test(query)))throw new Error("CodeGraph query is required for query and explore operations.");
  return {operation,...(query===undefined?{}:{query:query as string}),...(limit===undefined?{}:{limit:limit as number})};
}

function commandArguments(parameters:CodeGraphToolParameters,cwd:string):string[] {
  if(parameters.operation==="init")return ["init",cwd];
  const limit=parameters.limit??DEFAULT_LIMIT;
  return [parameters.operation,"--path",cwd,parameters.operation==="query"?"--limit":"--max-files",String(limit),"--",parameters.query!];
}
function truncateOutput(output:string):string {
  return output.length<=MAX_OUTPUT_CHARS?output:`${output.slice(0,MAX_OUTPUT_CHARS)}\n\n[CodeGraph output truncated]`;
}
function compatibilityResult(status:string,output="Use read/grep for exploration; no automatic index initialization.") {
  return {content:[{type:"text" as const,text:output}],details:{status}};
}
function fallbackStatus(error:unknown):"unavailable"|"failed" {
  return typeof error==="object"&&error!==null&&"code" in error&&(error as NodeJS.ErrnoException).code==="ENOENT"?"unavailable":"failed";
}

/** Canonical upstream-compatible CodeGraph tool. Only explicit `init` can create an index. */
export function createCodeGraphTool(runner:CodeGraphRunner=createCodeGraphRunner()):AnnotatedToolDefinition {
  return {
    name:"codegraph",
    renderShell:"self",
    label:"CodeGraph",
    description:"Initialize, search, or explore the CodeGraph index for the current Pi workspace only. This tool never accepts a project path or shell command.",
    promptSnippet:"Initialize and query CodeGraph for the current workspace without shell access",
    promptGuidelines:[
      "Use operation init before querying when the current workspace has no .codegraph index.",
      "Use query for symbol search and explore for source plus call paths. Do not use this tool to run arbitrary commands or target another directory.",
    ],
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false},
    parameters:CODEGRAPH_TOOL_PARAMETERS,
    executionMode:"sequential",
    execute:async(_id,input,signal,_update,context)=>{
      const request=canonicalParameters(input);
      const root=rootFor(context.cwd);
      assertSafeIndexDirectory(root);
      const args=commandArguments(request,root);
      try{
        const observed=await runner(args,{cwd:root,maxBuffer:PROCESS_MAX_BUFFER,...(signal===undefined?{}:{signal})});
        const output=truncateOutput([observed.stdout,observed.stderr].filter(Boolean).join("\n"));
        return {content:[{type:"text" as const,text:output||"CodeGraph completed without output."}],details:{operation:request.operation,cwd:root,args}};
      }catch(error){
        const status=fallbackStatus(error);
        const message=status==="unavailable"?`CodeGraph is unavailable because the codegraph binary was not found. ${FALLBACK_INSTRUCTIONS}`:`CodeGraph failed to run. ${FALLBACK_INSTRUCTIONS}`;
        return {content:[{type:"text" as const,text:message}],details:{status,operation:request.operation,cwd:root,fallback:FALLBACK_INSTRUCTIONS}};
      }
    },
  };
}

export function registerCodeGraphTool(pi:{registerTool(tool:ToolDefinition<any>):void},runner?:CodeGraphRunner):void {
  pi.registerTool(createCodeGraphTool(runner));
}

/** Installed CLI is trusted local code. Argument/root policy is not OS confinement. No index is inspected here. */
export function createCodeIntelligenceTool(options:CodeIntelligenceOptions={},injectedRunner?:CodeGraphRunner):AnnotatedToolDefinition {
  const configuration=Object.freeze({...options});
  const runner=injectedRunner??createCodeGraphRunner(configuration);
  return {
    name:"asen_code_intelligence",
    label:"ASEN code intelligence",
    description:"Read-only query/explore of the current canonical Git root. No path, executable, shell, init or permission override is accepted.",
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
    executionMode:"sequential",
    parameters:{type:"object",additionalProperties:false,required:["operation","query"],properties:{operation:{type:"string",enum:["query","explore"]},query:{type:"string",minLength:1,maxLength:2000},limit:{type:"integer",minimum:1,maximum:20}}},
    execute:async(_id,input,signal,_update,context)=>{
      const request=compatibilityParameters(input);
      if(!request)return compatibilityResult("invalid");
      if(signal?.aborted)return compatibilityResult("cancelled");
      let root:string;
      try{root=rootFor(context.cwd);}catch{return compatibilityResult("invalid_root");}
      try{assertSafeIndexDirectory(root);}catch{return compatibilityResult("failed");}
      let maxBuffer:number;
      try{maxBuffer=boundedConfiguration(configuration).maxBuffer;}catch{return compatibilityResult("invalid");}
      try{
        const args=commandArguments(request,root);
        const observed=await runner(args,{cwd:root,maxBuffer,...(signal===undefined?{}:{signal})});
        const output=[observed.stdout,observed.stderr].filter(Boolean).join("\n");
        if(Buffer.byteLength(output)>maxBuffer)return compatibilityResult("output_limit");
        return compatibilityResult("completed",output||"No matches.");
      }catch(error){
        const failure=error as NodeJS.ErrnoException&{killed?:boolean};
        const status=signal?.aborted?"cancelled":failure.code==="ENOENT"?"unavailable":failure.code==="ERR_CHILD_PROCESS_STDIO_MAXBUFFER"?"output_limit":failure.killed?"timeout":"failed";
        return compatibilityResult(status);
      }
    },
  };
}

/** Register canonical and compatibility names against the same hardened subprocess policy. */
export function registerCodeGraphTools(pi:{registerTool(tool:ToolDefinition<any>):void},options:CodeIntelligenceOptions={}):void {
  const runner=createCodeGraphRunner(options);
  pi.registerTool(createCodeIntelligenceTool(options,runner));
  registerCodeGraphTool(pi,runner);
}
