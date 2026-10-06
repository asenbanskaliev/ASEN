import {execFile,execFileSync} from "node:child_process";
import {accessSync,constants,readFileSync,realpathSync,statSync} from "node:fs";
import {delimiter,isAbsolute,join,relative,resolve} from "node:path";
import {homedir,tmpdir} from "node:os";
import {promisify,types} from "node:util";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";

export interface CodeIntelligenceOptions {executable?:string;script?:string;timeoutMs?:number;maxOutputBytes?:number}
const execute=promisify(execFile);
function contained(root:string,file:string):boolean {const suffix=relative(root,file);return suffix!==".."&&!/^\.\.[/\\]/.test(suffix)&&!isAbsolute(suffix);}
function regular(file:string):string {const canonical=realpathSync.native(file);if(!statSync(canonical).isFile())throw Error("Invalid executable");return canonical;}
/** Resolve npm Windows shims to their real JS entry; never execute cmd/PowerShell. */
export function resolveCodeGraphEntry(packageRoot:string):string {
  const root=realpathSync.native(packageRoot),metadata=regular(join(root,"package.json"));if(!contained(root,metadata))throw Error("Escaping package metadata");if(statSync(metadata).size>32768)throw Error("Oversized package metadata");
  const pkg=JSON.parse(readFileSync(metadata,"utf8")),target=typeof pkg.bin==="string"?pkg.bin:pkg.bin?.codegraph;
  if(typeof target!=="string"||!target||isAbsolute(target)||/^[A-Za-z]:/.test(target)||target.split(/[/\\]/).some(part=>part===".."))throw Error("Invalid package entry");
  const script=regular(resolve(root,target));if(!contained(root,script)||! /\.[cm]?js$/.test(script))throw Error("Escaping package entry");return script;
}
function command(options:CodeIntelligenceOptions):{executable:string;prefix:string[]} {
  if(options.script){if(!isAbsolute(options.script))throw Error("Script must be absolute");return {executable:regular(process.execPath),prefix:[regular(options.script)]};}
  if(options.executable){if(!isAbsolute(options.executable)||/\.(?:cmd|bat|ps1)$/i.test(options.executable))throw Error("Executable must be absolute and shell-free");return {executable:regular(options.executable),prefix:[]};}
  for(const entry of (process.env.Path??process.env.PATH??"").split(delimiter)){
    const directory=entry.replace(/^"|"$/g,"");if(!directory||!isAbsolute(directory))continue;
    try{
      if(process.platform==="win32"){
        try{return {executable:regular(join(directory,"codegraph.exe")),prefix:[]};}catch{}
        return {executable:regular(process.execPath),prefix:[resolveCodeGraphEntry(join(directory,"node_modules","@colbymchenry","codegraph"))]};
      }
      const executable=regular(join(directory,"codegraph"));accessSync(executable,constants.X_OK);return {executable,prefix:[]};
    }catch{}
  }
  throw Object.assign(Error("Unavailable"),{code:"ENOENT"});
}
function rootFor(cwd:string):string {
  const root=realpathSync.native(cwd);if(!statSync(root).isDirectory()||root===realpathSync.native(homedir())||root===realpathSync.native(tmpdir()))throw Error("Invalid root");
  const env={...process.env};for(const key of Object.keys(env))if(key.startsWith("GIT_"))delete env[key];
  const observed=execFileSync("git",["-c","core.quotepath=false","-C",root,"rev-parse","--show-toplevel"],{env,encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:5000,maxBuffer:16384,windowsHide:true}).trim();
  if(realpathSync.native(observed)!==root)throw Error("Current directory must be the canonical Git root");return root;
}
function parameters(value:unknown):{operation:"query"|"explore";query:string;limit:number}|null {
  if(!value||typeof value!=="object"||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)return null;
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(value).some(key=>typeof key!=="string"||!["operation","query","limit"].includes(key)||!("value" in descriptors[key]!)))return null;
  const operation=descriptors.operation?.value,query=descriptors.query?.value,limit=descriptors.limit?descriptors.limit.value:10;
  if(!["query","explore"].includes(operation)||typeof query!=="string"||!query.trim()||query.length>2000||/[\u0000-\u001f\u007f]/.test(query)||!Number.isInteger(limit)||limit<1||limit>20)return null;
  return {operation,query,limit};
}
function result(status:string,output="Use read/grep for exploration; no automatic index initialization.") {
  return {content:[{type:"text" as const,text:output}],details:{status}};
}
/** Installed CLI is trusted local code. Argument/root policy is not OS confinement. No index is inspected here. */
export function createCodeIntelligenceTool(options:CodeIntelligenceOptions={}):ToolDefinition<any> {
  const configuration=Object.freeze({...options});
  return {
    name:"asen_code_intelligence",label:"ASEN code intelligence",description:"Read-only query/explore of the current canonical Git root. No path, executable, shell, init or permission override is accepted.",executionMode:"sequential",
    parameters:{type:"object",additionalProperties:false,required:["operation","query"],properties:{operation:{type:"string",enum:["query","explore"]},query:{type:"string",minLength:1,maxLength:2000},limit:{type:"integer",minimum:1,maximum:20}}},
    execute:async(_id,input,signal,_update,context)=>{
      const request=parameters(input);if(!request)return result("invalid");if(signal?.aborted)return result("cancelled");
      let root:string;try{root=rootFor(context.cwd);}catch{return result("invalid_root");}
      const timeout=configuration.timeoutMs??15000,maxBuffer=configuration.maxOutputBytes??100000;
      if(!Number.isSafeInteger(timeout)||timeout<1||timeout>30000||!Number.isSafeInteger(maxBuffer)||maxBuffer<1||maxBuffer>200000)return result("invalid");
      try{
        const {executable,prefix}=command(configuration),args=[request.operation,"--path",root,request.operation==="query"?"--limit":"--max-files",String(request.limit),"--",request.query];
        const env:NodeJS.ProcessEnv={};for(const key of ["PATH","Path","HOME","USERPROFILE","SystemRoot","TEMP","TMP","LANG","LC_ALL"])if(process.env[key])env[key]=process.env[key];
        const observed=await execute(executable,[...prefix,...args],{cwd:root,env,signal,timeout,maxBuffer,killSignal:"SIGKILL",windowsHide:true,shell:false});
        const output=[observed.stdout,observed.stderr].filter(Boolean).join("\n");if(Buffer.byteLength(output)>maxBuffer)return result("output_limit");
        return result("completed",output||"No matches.");
      }catch(error){
        const failure=error as NodeJS.ErrnoException&{killed?:boolean};
        return result(signal?.aborted?"cancelled":failure.code==="ENOENT"?"unavailable":failure.code==="ERR_CHILD_PROCESS_STDIO_MAXBUFFER"?"output_limit":failure.killed?"timeout":"failed");
      }
    },
  };
}
